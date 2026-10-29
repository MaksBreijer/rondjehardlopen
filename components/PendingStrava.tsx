"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import type { PendingUpload } from "./RunMode";

/** After the Strava OAuth round trip, upload the run that was waiting. */
export default function PendingStrava() {
  const [state, setState] = useState<{ kind: "idle" | "busy" | "ok" | "err"; msg?: string; id?: number | null }>({ kind: "idle" });
  const [flag, setFlag] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const s = p.get("strava");
    if (!s) return;
    setFlag(s);
    history.replaceState(null, "", location.pathname);
    if (s !== "connected") return;
    let pending: PendingUpload | null = null;
    try {
      pending = JSON.parse(localStorage.getItem("rh.pending-upload") || "null");
    } catch {}
    if (!pending) return;
    setState({ kind: "busy" });
    (async () => {
      try {
        const res = await fetch("/api/strava/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gpx: pending!.gpx, name: pending!.name }) });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Upload mislukt");
        let id: number | null = null;
        for (let i = 0; i < 12 && !id; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const st = await (await fetch(`/api/strava/upload?id=${j.id}`)).json();
          if (st.error) throw new Error(st.error);
          id = st.activityId;
        }
        localStorage.removeItem("rh.pending-upload");
        setState({ kind: "ok", id });
      } catch (e) {
        setState({ kind: "err", msg: e instanceof Error ? e.message : "Upload mislukt" });
      }
    })();
  }, []);

  if (!flag) return null;
  const text =
    flag === "not_configured" ? "Strava is niet geconfigureerd op deze server."
    : flag === "denied" ? "Strava-koppeling geannuleerd."
    : flag === "error" ? "Koppelen met Strava is mislukt. Probeer het opnieuw."
    : state.kind === "busy" ? "Verbonden met Strava. Je run wordt geüpload…"
    : state.kind === "ok" ? "Je run staat op Strava."
    : state.kind === "err" ? `Uploaden mislukt: ${state.msg}`
    : "Verbonden met Strava.";
  return (
    <div className="toast" role="status">
      {text} {state.kind === "ok" && state.id && <a href={`https://www.strava.com/activities/${state.id}`} target="_blank" rel="noopener noreferrer">Bekijk</a>}
      <button onClick={() => setFlag(null)} aria-label="Sluiten"><Icon name="close" /></button>
    </div>
  );
}
