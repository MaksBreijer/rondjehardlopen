"use client";

import "leaflet/dist/leaflet.css";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import type * as LType from "leaflet";
import Icon from "./Icon";
import { haversine, pathLength, snapToPath } from "@/lib/geo";
import { buildRecordedGpx, type RecordedPoint } from "@/lib/gpx";
import { km as fmtKm } from "@/lib/format";
import { downloadText, slug } from "@/lib/client/links";
import type { RouteResult } from "@/lib/types";

const TILES = process.env.NEXT_PUBLIC_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OFF_ROUTE_M = 50;

type Phase = "ready" | "countdown" | "running" | "paused" | "done";

const clock = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};
const pace = (sPerKm: number) => (Number.isFinite(sPerKm) && sPerKm > 0 && sPerKm < 3600 ? `${Math.floor(sPerKm / 60)}:${String(Math.round(sPerKm % 60)).padStart(2, "0")}` : "-:--");

export interface PendingUpload {
  name: string;
  gpx: string;
  distanceM: number;
  seconds: number;
}

export default function RunMode({ route, onClose }: { route: RouteResult; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [count, setCount] = useState(3);
  const [err, setErr] = useState("");
  const [dist, setDist] = useState(0);
  const [secs, setSecs] = useState(0);
  const [along, setAlong] = useState(0);
  const [off, setOff] = useState(0);
  const [strava, setStrava] = useState<{ configured: boolean; connected: boolean } | null>(null);
  const [upload, setUpload] = useState<{ state: "idle" | "busy" | "ok" | "err"; msg?: string; activityId?: number | null }>({ state: "idle" });

  const total = route.distanceM || pathLength(route.geometry);
  const sim = typeof window !== "undefined" && new URLSearchParams(location.search).has("sim");

  const phaseRef = useRef<Phase>("ready");
  const points = useRef<RecordedPoint[]>([]);
  const movingMs = useRef(0);
  const lastTick = useRef(0);
  const distRef = useRef(0);
  const watch = useRef<number | null>(null);
  const simTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);
  const warned = useRef(false);

  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<LType.Map | null>(null);
  const me = useRef<LType.Marker | null>(null);
  const lf = useRef<typeof LType | null>(null);
  const follow = useRef(true);

  const setP = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  /* map */
  useEffect(() => {
    let dead = false;
    import("leaflet").then((mod) => {
      if (dead || !mapEl.current) return;
      const L = ((mod as any).default ?? mod) as typeof LType;
      lf.current = L;
      const m = L.map(mapEl.current, { zoomControl: false, attributionControl: false });
      L.control.attribution({ position: "topright", prefix: false }).addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>').addTo(m);
      map.current = m;
      L.tileLayer(TILES, { maxZoom: 19 }).addTo(m);
      const line = route.geometry.map((p) => [p.lat, p.lng] as [number, number]);
      L.polyline(line, { color: "#0c1115", weight: 12, opacity: 0.85 }).addTo(m);
      L.polyline(line, { color: "#ffffff", weight: 5 }).addTo(m);
      L.marker([route.start.lat, route.start.lng], { icon: L.divIcon({ className: "", html: '<div class="pin"><span>S</span></div>', iconSize: [32, 32], iconAnchor: [4, 32] }) }).addTo(m);
      if (route.stop) L.circleMarker([route.stop.location.lat, route.stop.location.lng], { radius: 9, color: "#0c1115", weight: 3, fillColor: "#ffffff", fillOpacity: 1 }).addTo(m);
      m.fitBounds(L.latLngBounds(line), { padding: [40, 40] });
      m.on("dragstart", () => (follow.current = false));
    });
    return () => {
      dead = true;
      map.current?.remove();
      map.current = null;
    };
  }, [route]);

  const onFix = useCallback(
    (lat: number, lng: number, t: number, acc?: number) => {
      const L = lf.current;
      if (map.current && L) {
        if (!me.current) me.current = L.marker([lat, lng], { icon: L.divIcon({ className: "", html: '<div class="me"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }), zIndexOffset: 1000 }).addTo(map.current);
        me.current.setLatLng([lat, lng]);
        if (follow.current && phaseRef.current !== "ready") map.current.setView([lat, lng], Math.max(map.current.getZoom(), 17), { animate: true });
      }
      const snap = snapToPath({ lat, lng }, route.geometry);
      setOff(snap.offM);
      if (snap.offM > OFF_ROUTE_M && !warned.current) {
        warned.current = true;
        navigator.vibrate?.([250, 100, 250]);
      } else if (snap.offM <= OFF_ROUTE_M) warned.current = false;
      if (phaseRef.current !== "running") return;
      if (acc !== undefined && acc > 35) return; // ignore poor fixes
      const prev = points.current.at(-1);
      if (prev) {
        const d = haversine(prev, { lat, lng });
        if (d < 3) return; // standing still / jitter
        distRef.current += d;
        setDist(distRef.current);
        setAlong((a) => Math.max(a, snap.alongM));
      }
      points.current.push({ lat, lng, t });
    },
    [route],
  );

  const stopSensors = useCallback(() => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    if (simTimer.current) clearInterval(simTimer.current);
    simTimer.current = null;
    wake.current?.release().catch(() => {});
    wake.current = null;
  }, []);

  useEffect(() => stopSensors, [stopSensors]);

  /* clock */
  useEffect(() => {
    if (phase !== "running") return;
    lastTick.current = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      movingMs.current += now - lastTick.current;
      lastTick.current = now;
      setSecs(movingMs.current / 1000);
    }, 500);
    return () => {
      clearInterval(id);
      movingMs.current += Date.now() - lastTick.current;
    };
  }, [phase]);

  function startSensors() {
    navigator.wakeLock?.request("screen").then((w) => (wake.current = w)).catch(() => {});
    if (sim) {
      let i = 0;
      const pts = route.geometry;
      simTimer.current = setInterval(() => {
        i = Math.min(pts.length - 1, i + 2);
        const p = pts[i];
        onFix(p.lat, p.lng, Date.now(), 5);
        if (i >= pts.length - 1) clearInterval(simTimer.current!);
      }, 300);
      return;
    }
    watch.current = navigator.geolocation.watchPosition(
      (pos) => onFix(pos.coords.latitude, pos.coords.longitude, pos.timestamp, pos.coords.accuracy),
      (e) => setErr(e.code === 1 ? "Locatietoegang is geweigerd. Sta locatie toe in je browserinstellingen om te kunnen starten." : "Je locatie is nu niet beschikbaar. Ga naar buiten of controleer je GPS."),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
  }

  function begin() {
    setErr("");
    if (!sim && !("geolocation" in navigator)) return setErr("Je browser ondersteunt geen locatie.");
    startSensors();
    setP("countdown");
    let c = 3;
    setCount(c);
    const id = setInterval(() => {
      c--;
      if (c <= 0) {
        clearInterval(id);
        points.current = [];
        distRef.current = 0;
        movingMs.current = 0;
        // first fix after the countdown becomes the first track point
        const first = me.current?.getLatLng();
        if (first) points.current.push({ lat: first.lat, lng: first.lng, t: Date.now() });
        setP("running");
        follow.current = true;
      } else setCount(c);
    }, 900);
  }

  function finish() {
    stopSensors();
    setP("done");
    fetch("/api/strava/status").then((r) => r.json()).then(setStrava).catch(() => setStrava({ configured: false, connected: false }));
  }

  const name = `${route.title.replace(/ - .*$/, "")} (${fmtKm(distRef.current)})`;
  const gpx = () => buildRecordedGpx(name, points.current);

  async function sendToStrava() {
    setUpload({ state: "busy" });
    try {
      const res = await fetch("/api/strava/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gpx: gpx(), name }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Upload mislukt");
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const s = await (await fetch(`/api/strava/upload?id=${j.id}`)).json();
        if (s.error) throw new Error(s.error);
        if (s.activityId) return setUpload({ state: "ok", activityId: s.activityId });
      }
      setUpload({ state: "ok", msg: "Strava verwerkt je run nog; hij verschijnt zo in je feed." });
    } catch (e) {
      setUpload({ state: "err", msg: e instanceof Error ? e.message : "Upload mislukt" });
    }
  }

  function connectStrava() {
    try {
      localStorage.setItem("rh.pending-upload", JSON.stringify({ name, gpx: gpx(), distanceM: distRef.current, seconds: movingMs.current / 1000 } satisfies PendingUpload));
    } catch {}
    location.href = "/api/strava/login";
  }

  const remaining = Math.max(0, total - along);
  const avg = dist > 50 ? secs / (dist / 1000) : NaN;
  const offRoute = off > OFF_ROUTE_M && phase === "running";

  return createPortal(
    <div className="run" role="dialog" aria-label="Hardlopen starten">
      <div ref={mapEl} className="run-map" />
      <div className="run-top">
        <button className="btn small ghost" onClick={() => { stopSensors(); onClose(); }} aria-label="Sluiten"><Icon name="close" /></button>
        {offRoute && <div className="off">Je bent {Math.round(off)} m van de route</div>}
        {phase === "running" && !offRoute && <div className="on">Op route · nog {fmtKm(remaining)}</div>}
        {sim && <span className="simtag">demo</span>}
      </div>

      {phase === "countdown" && <div className="countdown" aria-live="assertive">{count}</div>}

      <div className="run-sheet">
        {phase === "ready" && (
          <>
            <h3>{route.title}</h3>
            <p className="hint">Je telefoon volgt je locatie en neemt je run op. Houd dit scherm open; we houden je scherm aan. Voor een horloge: gebruik “Naar je horloge”.</p>
            {err && <div className="notice err" role="alert">{err}</div>}
            <button className="btn big" onClick={begin}><Icon name="play" /> Start run</button>
          </>
        )}
        {(phase === "running" || phase === "paused" || phase === "countdown") && (
          <>
            <div className="stats">
              <div><b>{(dist / 1000).toFixed(2).replace(".", ",")}</b><span>km</span></div>
              <div><b>{clock(secs)}</b><span>tijd</span></div>
              <div><b>{pace(avg)}</b><span>min/km</span></div>
            </div>
            <div className="prog"><i style={{ width: `${Math.min(100, (along / total) * 100)}%` }} /></div>
            {err && <div className="notice err" role="alert">{err}</div>}
            <div className="actions">
              {phase === "running" ? (
                <button className="btn ghost" onClick={() => setP("paused")}><Icon name="pause" /> Pauze</button>
              ) : (
                <button className="btn" onClick={() => setP("running")} disabled={phase === "countdown"}><Icon name="play" /> Hervat</button>
              )}
              <button className="btn" onClick={finish} disabled={phase === "countdown"}><Icon name="stop" /> Stop</button>
            </div>
          </>
        )}
        {phase === "done" && (
          <>
            <h3>Goed gedaan <Icon name="flag" /></h3>
            <div className="stats">
              <div><b>{(dist / 1000).toFixed(2).replace(".", ",")}</b><span>km</span></div>
              <div><b>{clock(secs)}</b><span>tijd</span></div>
              <div><b>{pace(avg)}</b><span>min/km</span></div>
            </div>
            {points.current.length < 2 && <div className="notice warn">Er is nog geen track opgenomen (te kort of geen GPS).</div>}
            <div className="actions">
              <button className="btn ghost" disabled={points.current.length < 2} onClick={() => downloadText(`${slug(name)}-opname.gpx`, gpx())}><Icon name="download" /> GPX opslaan</button>
              {strava?.configured && strava.connected && upload.state !== "ok" && (
                <button className="btn green" disabled={upload.state === "busy" || points.current.length < 2} onClick={sendToStrava}>{upload.state === "busy" ? "Uploaden…" : "Upload naar Strava"}</button>
              )}
              {strava?.configured && !strava.connected && <button className="btn green" disabled={points.current.length < 2} onClick={connectStrava}>Verbind Strava</button>}
            </div>
            {strava && !strava.configured && <p className="hint">Strava-koppeling staat uit: de beheerder moet STRAVA_CLIENT_ID en STRAVA_CLIENT_SECRET instellen (zie README).</p>}
            {upload.state === "ok" && (
              <div className="notice info">
                Staat op Strava. {upload.msg} {upload.activityId && <a href={`https://www.strava.com/activities/${upload.activityId}`} target="_blank" rel="noopener noreferrer">Bekijk activiteit</a>}
              </div>
            )}
            {upload.state === "err" && <div className="notice err">{upload.msg}</div>}
            <button className="btn big" style={{ marginTop: 10 }} onClick={onClose}>Klaar</button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
