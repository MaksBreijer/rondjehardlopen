"use client";

import { createPortal } from "react-dom";
import { useState } from "react";
import Icon from "./Icon";
import { buildGpx } from "@/lib/gpx";
import { appleMapsUrl, downloadText, googleMapsUrl, slug } from "@/lib/client/links";
import type { RouteResult } from "@/lib/types";

const BRANDS: { id: string; name: string; steps: string }[] = [
  { id: "garmin", name: "Garmin", steps: "Deel het bestand met de Garmin Connect-app, of importeer het op connect.garmin.com onder Training → Courses → Importeren. Daarna kun je de course naar je horloge sturen en daar kiezen onder Navigatie." },
  { id: "wahoo", name: "Wahoo", steps: "Deel het bestand met de Wahoo ELEMNT-app (of importeer het via de app onder Routes). Het verschijnt daarna op je ELEMNT." },
  { id: "coros", name: "Coros / Suunto / Polar", steps: "Deel het GPX-bestand met de bijbehorende app (COROS, Suunto, Polar Flow) en importeer het als route." },
  { id: "strava", name: "Strava", steps: "Strava kan geen gepland rondje van een andere app ontvangen: Strava Routes accepteert alleen een GPX-import via de website. Je opgenomen run kun je wel automatisch uploaden na afloop (zie Start)." },
];

export default function DeviceSheet({ route, onClose }: { route: RouteResult; onClose: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const gpx = () => buildGpx(route);
  const file = () => new File([gpx()], `${slug(route.title)}.gpx`, { type: "application/gpx+xml" });

  async function shareFile() {
    const f = file();
    try {
      if (navigator.canShare?.({ files: [f] })) {
        await navigator.share({ files: [f], title: route.title });
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
    downloadText(f.name, gpx());
    setMsg("GPX gedownload. Open het met de app van je horloge.");
  }

  return createPortal(
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Naar je horloge" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>Naar je horloge of fietscomputer</h3>
          <button className="btn small ghost" onClick={onClose} aria-label="Sluiten"><Icon name="close" /></button>
        </div>
        <p className="hint">Een website kan een horloge niet rechtstreeks starten. Het GPX-bestand is wel het formaat dat Garmin, Wahoo, Coros, Suunto en Polar zelf importeren.</p>
        <button className="btn big" onClick={shareFile}><Icon name="download" /> Deel of download GPX</button>
        {msg && <div className="notice info">{msg}</div>}
        <div className="brands">
          {BRANDS.map((b) => (
            <div key={b.id} className="brand">
              <button aria-expanded={open === b.id} onClick={() => setOpen(open === b.id ? null : b.id)}>
                {b.name} <span>{open === b.id ? "−" : "+"}</span>
              </button>
              {open === b.id && <p>{b.steps}</p>}
            </div>
          ))}
        </div>
        <div className="alt-links">
          <a href={googleMapsUrl(route)} target="_blank" rel="noopener noreferrer">Google Maps</a>
          <a href={appleMapsUrl(route)} target="_blank" rel="noopener noreferrer">Apple Maps</a>
        </div>
      </div>
    </div>,
    document.body,
  );
}
