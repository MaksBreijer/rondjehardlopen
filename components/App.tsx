"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, categoryInfo } from "@/lib/categories";
import { kmLabel } from "@/lib/format";
import { loadSaved, removeSaved, saveRoute, type SavedRoute } from "@/lib/client/saved";
import { DISTANCES_KM, type ApiError, type Category, type GenerateResponse, type Prefs, type RouteRequest, type RouteResult, type StopAlternative, type StopMode, type VisitMode } from "@/lib/types";
import Icon from "./Icon";
import QuickRow from "./QuickRow";
import Cinema from "./Cinema";
import HeroWidget from "./HeroWidget";
import DestinationPicker from "./DestinationPicker";
import DistancePicker from "./DistancePicker";
import ResultsView from "./ResultsView";
import Logo from "./Logo";
import PhotoCredits from "./PhotoCredits";
import PendingStrava from "./PendingStrava";
import StartPicker, { type StartPoint } from "./StartPicker";

type Phase = "plan" | "loading" | "results";
const CATS = ["coffee", "bakery", "supermarket", "green", "surprise"];
const LOADING = ["Bestemmingen in de buurt zoeken…", "Rondjes door de wijk berekenen…", "Afstanden bijstellen…", "Beste varianten kiezen…"];

export default function App() {
  const [start, setStart] = useState<StartPoint | null>(null);
  const [km, setKm] = useState<number>(10);
  const [category, setCategory] = useState<Category | null>("coffee");
  const [stopMode, setStopMode] = useState<StopMode>("midway");
  const [visit, setVisit] = useState<VisitMode>("visit");
  const [prefs, setPrefs] = useState<Prefs>({ green: false, quiet: false });
  const [pace, setPace] = useState(360);

  const [phase, setPhase] = useState<Phase>("plan");
  const [seed, setSeed] = useState(1);
  const [data, setData] = useState<GenerateResponse | null>(null);
  const [fromSaved, setFromSaved] = useState(false);
  const [error, setError] = useState<ApiError["error"] | null>(null);
  const [loadingMsg, setLoadingMsg] = useState(0);
  const [saved, setSaved] = useState<SavedRoute[]>([]);
  const [startError, setStartError] = useState(false);
  const [pastHero, setPastHero] = useState(false);
  useEffect(() => {
    const on = () => setPastHero(window.scrollY > window.innerHeight * 0.6);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  useEffect(() => setSaved(loadSaved()), []);
  useEffect(() => {
    if (phase !== "loading") return;
    const t = setInterval(() => setLoadingMsg((m) => (m + 1) % LOADING.length), 2600);
    return () => clearInterval(t);
  }, [phase]);

  const request = useCallback(
    (s: StartPoint, over: Partial<RouteRequest> = {}): RouteRequest => ({
      start: s.location,
      distanceKm: km,
      category,
      stopMode,
      visit,
      prefs,
      seed,
      paceSecPerKm: pace,
      ...over,
    }),
    [km, category, stopMode, visit, prefs, seed, pace],
  );

  const run = useCallback(async (req: RouteRequest) => {
    setPhase("loading");
    setError(null);
    setLoadingMsg(0);
    setFromSaved(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      const res = await fetch("/api/routes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
      const json = await res.json();
      if (!res.ok) {
        setError((json as ApiError).error);
        setPhase("plan");
        return;
      }
      setData(json as GenerateResponse);
      setPhase("results");
    } catch {
      setError({ code: "ROUTING_FAILED", message: "Geen verbinding met de server. Controleer je internet en probeer opnieuw." });
      setPhase("plan");
    }
  }, []);

  // Shared link: ?lat&lng&km&cat&mode&visit&g&q&seed
  const sharedRan = useRef(false);
  useEffect(() => {
    if (sharedRan.current) return;
    sharedRan.current = true;
    const p = new URLSearchParams(window.location.search);
    const lat = Number(p.get("lat"));
    const lng = Number(p.get("lng"));
    if (!p.has("lat") || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const s: StartPoint = { location: { lat, lng }, label: p.get("label") || "Gedeeld startpunt" };
    const k = Number(p.get("km"));
    const c = p.get("cat");
    const req: Partial<RouteRequest> = {
      distanceKm: Number.isFinite(k) && k > 0 ? k : 10,
      category: c && CATS.includes(c) ? (c as Category) : null,
      stopMode: p.get("mode") === "turnaround" || p.get("mode") === "finish" ? (p.get("mode") as StopMode) : "midway",
      visit: p.get("visit") === "pass" ? "pass" : "visit",
      prefs: { green: p.get("g") === "1", quiet: p.get("q") === "1" },
      seed: Number(p.get("seed")) || 1,
    };
    setStart(s);
    setKm(req.distanceKm!);
    setCategory(req.category ?? null);
    setStopMode(req.stopMode!);
    setVisit(req.visit!);
    setPrefs(req.prefs!);
    setSeed(req.seed!);
    run({ ...(req as RouteRequest), start: s.location, paceSecPerKm: 360 });
  }, [run]);

  function go(nextSeed = seed, over: Partial<RouteRequest> = {}) {
    if (!start) {
      setStartError(true);
      document.getElementById("step-start")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSeed(nextSeed);
    run(request(start, { seed: nextSeed, ...over }));
  }

  async function share(r: RouteResult): Promise<string> {
    const q = new URLSearchParams({ lat: r.start.lat.toFixed(5), lng: r.start.lng.toFixed(5), km: String(km), mode: stopMode, visit, seed: String(seed) });
    if (category) q.set("cat", category);
    if (prefs.green) q.set("g", "1");
    if (prefs.quiet) q.set("q", "1");
    const url = `${location.origin}/?${q}`;
    const text = `${r.title}: ${r.description}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: r.title, text, url });
        return "Gedeeld.";
      }
      await navigator.clipboard.writeText(url);
      return "Link gekopieerd. Wie hem opent krijgt hetzelfde rondje berekend.";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "";
      return url;
    }
  }

  const savedIds = useMemo(() => new Set(saved.map((s) => s.route.id)), [saved]);
  const toggleSave = (r: RouteResult) => setSaved(savedIds.has(r.id) ? removeSaved(r.id) : saveRoute(r));

  function openSaved(s: SavedRoute) {
    setData({ routes: [s.route], targetM: s.route.distanceM, warnings: [], provider: "opgeslagen route" });
    setFromSaved(true);
    setPhase("results");
    window.scrollTo({ top: 0 });
  }

  function tryAlternative(a: StopAlternative) {
    if (!a.minDistanceKm) return;
    setKm(a.minDistanceKm);
    go(seed, { distanceKm: a.minDistanceKm });
  }

  const wide = phase === "results";
  return (
    <div className={`wrap${wide ? " wide" : ""}${phase === "plan" ? " plan" : ""}`}>
      <PendingStrava />
      {phase !== "plan" && (
        <div className="topbar">
          <button className="logo" onClick={() => setPhase("plan")} aria-label="RondjeHardlopen.nl, naar begin">
            <Logo />
          </button>
        </div>
      )}

      {phase === "loading" && (
        <div className="loading" role="status" aria-live="polite">
          <svg className="draw" viewBox="0 0 100 100" aria-hidden="true">
            <path className="draw-ring" d="M88.8 40.3A40 40 0 1 0 88.8 59.7" />
            <circle className="draw-dot" cx="91" cy="50" r="8" />
          </svg>
          <h2>We zoeken je rondje</h2>
          <p>{LOADING[loadingMsg]}</p>
          <p className="hint">Dit duurt meestal 10 tot 30 seconden.</p>
        </div>
      )}

      {phase === "results" && data && (
        <ResultsView
          key={data.routes.map((r) => r.id).join()}
          data={data}
          distanceKm={fromSaved ? null : km}
          savedIds={savedIds}
          canRegenerate={!fromSaved}
          onBack={() => setPhase("plan")}
          onRegenerate={() => go(seed + 1)}
          onSave={toggleSave}
          onShare={share}
        />
      )}

      {phase === "plan" && (
        <>
          <Cinema
            onLogo={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            widget={
              <HeroWidget
                km={km}
                onKm={setKm}
                category={category}
                paceSecPerKm={pace}
                startLabel={start?.label ?? null}
                saved={saved.length}
                onJump={() => document.getElementById("step-start")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              />
            }
          >
            <QuickRow>
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  className="chip"
                  aria-pressed={category === c.id}
                  onClick={() => {
                    setCategory(c.id);
                    document.getElementById("step-start")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  <Icon name={c.icon} /> {c.label}
                </button>
              ))}
            </QuickRow>
          </Cinema>
          <div className="planner-wrap">

          <div className="planner">
          <section className="step" id="step-start">
            <h2><span className="n">01</span> Waar begin je?</h2>
            <StartPicker value={start} onChange={(s) => { setStart(s); setStartError(false); }} />
            {startError && <div className="notice err" role="alert">Kies eerst een startpunt.</div>}
          </section>

          <section className="step">
            <h2><span className="n">02</span> Hoe ver wil je?</h2>
            <DistancePicker value={km} onChange={setKm} />
          </section>

          <section className="step">
            <h2><span className="n">03</span> Waar heb je zin in? <small>optioneel</small></h2>
            <DestinationPicker
              category={category}
              stopMode={stopMode}
              visit={visit}
              prefs={prefs}
              onCategory={setCategory}
              onStopMode={setStopMode}
              onVisit={setVisit}
              onPrefs={setPrefs}
            />
            <div className="opts">
              <div>
                <label className="k" htmlFor="pace">Tempo (voor de looptijd)</label>
                <select id="pace" className="input" value={pace} onChange={(e) => setPace(Number(e.target.value))}>
                  {[270, 300, 330, 360, 390, 420, 450, 480].map((s) => (
                    <option key={s} value={s}>{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")} min/km</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          </div>

          {error && (
            <div className="notice err" role="alert">
              <b>{error.message}</b>
              {error.alternatives && error.alternatives.length > 0 && (
                <div className="alts">
                  {error.alternatives.map((a) => (
                    <div className="alt" key={a.poi.id}>
                      <div>
                        <b><Icon name={categoryInfo(a.poi.category).icon} /> {a.poi.name}</b>
                        <span>{(a.crowDistanceM / 1000).toFixed(1).replace(".", ",")} km hemelsbreed{a.minDistanceKm ? `, past in ${kmLabel(a.minDistanceKm)} km` : ", te ver voor de keuzes"}</span>
                      </div>
                      {a.minDistanceKm && <button className="btn small" onClick={() => tryAlternative(a)}>{kmLabel(a.minDistanceKm)} km</button>}
                    </div>
                  ))}
                </div>
              )}
              <div className="actions">
                {category && <button className="btn small ghost" onClick={() => { setCategory(null); go(seed, { category: null }); }}>Rondje zonder bestemming</button>}
                {(error.code === "POI_UNAVAILABLE" || error.code === "ROUTING_FAILED") && <button className="btn small ghost" onClick={() => go()}>Opnieuw proberen</button>}
              </div>
            </div>
          )}

          <div className={`cta-bar${pastHero ? "" : " away"}`}>
            <div className="cta-inner">
              <div className="cta-sum">
                <b>{kmLabel(km)} km{category ? ` · ${categoryInfo(category).label}` : ""}</b>
                <span>{start ? start.label.split(",").slice(0, 2).join(",") : "Nog geen startpunt"}</span>
              </div>
              <button className="btn green" onClick={() => go(1)}>Maak mijn rondje <Icon name="arrow" /></button>
            </div>
          </div>

          {saved.length > 0 && (
            <section className="saved">
              <h2>Bewaarde rondjes</h2>
              <ul>
                {saved.map((s) => (
                  <li key={s.route.id}>
                    <div className="meta">
                      <b>{s.route.title}</b>
                      <span>{s.route.stop ? s.route.stop.category === "surprise" ? "met verrassingsstop" : `via ${s.route.stop.name}` : "zonder bestemming"}</span>
                    </div>
                    <button className="btn small" onClick={() => openSaved(s)}>Open</button>
                    <button className="btn small ghost" aria-label="Verwijder" onClick={() => setSaved(removeSaved(s.route.id))}><Icon name="close" /></button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <PhotoCredits />
          <p className="foot">
            Gratis, zonder account. Kaartdata © OpenStreetMap-bijdragers. Bestemmingen komen uit OpenStreetMap; openingstijden tonen we alleen als die daar staan.
          </p>
          </div>
        </>
      )}
    </div>
  );
}
