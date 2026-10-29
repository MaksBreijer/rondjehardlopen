"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { kmLabel } from "@/lib/format";
import type { GenerateResponse, RouteResult } from "@/lib/types";
import Icon from "./Icon";
import RouteCard from "./RouteCard";

const RouteMap = dynamic(() => import("./RouteMap"), {
  ssr: false,
  loading: () => <div className="map" style={{ display: "grid", placeItems: "center", color: "#62727a" }}>Kaart laden…</div>,
});

interface Props {
  data: GenerateResponse;
  distanceKm: number | null;
  savedIds: Set<string>;
  canRegenerate: boolean;
  onBack: () => void;
  onRegenerate: () => void;
  onSave: (r: RouteResult) => void;
  onShare: (r: RouteResult) => Promise<string>;
}

export default function ResultsView({ data, distanceKm, savedIds, canRegenerate, onBack, onRegenerate, onSave, onShare }: Props) {
  const [selectedId, setSelectedId] = useState(data.routes[0].id);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<Record<string, string>>({});
  const reveal = (id: string) => setRevealed((s) => new Set(s).add(id));

  return (
    <div className="results">
      <div className="mapcol">
        <RouteMap routes={data.routes} selectedId={selectedId} revealed={revealed} onSelect={setSelectedId} />
      </div>
      <div className="cards">
        <div className="resbar">
          <button className="btn small ghost" onClick={onBack}><Icon name="back" /> Aanpassen</button>
          {canRegenerate && <button className="btn small" onClick={onRegenerate}><Icon name="refresh" /> Nieuwe alternatieven</button>}
        </div>
        <h2>{data.routes.length === 1 ? "Jouw rondje" : `${data.routes.length} rondjes${distanceKm ? ` van ca. ${kmLabel(distanceKm)} km` : ""}`}</h2>
        {data.evaluated ? <p className="hint" style={{ marginTop: -6 }}>Gekozen uit {data.evaluated} doorgerekende rondjes, rustigste en best passende eerst.</p> : null}
        {data.warnings.map((w) => (
          <div className="notice warn" key={w}>{w}</div>
        ))}
        {data.routes.map((r) => (
          <RouteCard
            key={r.id}
            route={r}
            selected={r.id === selectedId}
            hidden={r.stop?.category === "surprise" && !revealed.has(r.id)}
            saved={savedIds.has(r.id)}
            onSelect={() => setSelectedId(r.id)}
            onReveal={() => reveal(r.id)}
            onSave={() => onSave(r)}
            onShare={async () => {
              const msg = await onShare(r);
              setNote((n) => ({ ...n, [r.id]: msg }));
            }}
            shareNote={note[r.id]}
          />
        ))}
        <p className="hint">
          Routes zijn berekend op basis van OpenStreetMap-data via {data.provider}. Let altijd op verkeer en borden; wegen kunnen tijdelijk afgesloten of niet geschikt zijn.
        </p>
      </div>
    </div>
  );
}
