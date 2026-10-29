"use client";

import { categoryInfo } from "@/lib/categories";
import { buzz } from "@/lib/client/haptics";
import { duration, kmLabel } from "@/lib/format";
import type { Category } from "@/lib/types";
import Icon from "./Icon";

interface Props {
  km: number;
  onKm: (km: number) => void;
  category: Category | null;
  paceSecPerKm: number;
  startLabel: string | null;
  saved: number;
  onJump: () => void;
}

/** Compact "today" panel in the hero: your next run at a glance, adjustable without scrolling. */
export default function HeroWidget({ km, onKm, category, paceSecPerKm, startLabel, saved, onJump }: Props) {
  const step = (d: number) => {
    buzz();
    onKm(Math.min(30, Math.max(2, Math.round((km + d) * 2) / 2)));
  };
  return (
    <div className="hw" role="group" aria-label="Jouw rondje van vandaag">
      <div className="hw-head">
        <span>Jouw rondje</span>
        {saved > 0 && <span className="hw-saved">{saved} bewaard</span>}
      </div>
      <div className="hw-main">
        <button className="hw-step" onClick={() => step(-0.5)} aria-label="Halve kilometer minder" disabled={km <= 2}>−</button>
        <div className="hw-km" aria-live="polite">
          <b>{kmLabel(km)}</b>
          <small>km</small>
        </div>
        <button className="hw-step" onClick={() => step(0.5)} aria-label="Halve kilometer meer" disabled={km >= 30}>+</button>
      </div>
      <div className="hw-grid">
        <div>
          <small>Looptijd</small>
          <b>{duration(km * paceSecPerKm)}</b>
        </div>
        <div>
          <small>Bestemming</small>
          <b>{category ? <><Icon name={categoryInfo(category).icon} /> {categoryInfo(category).label}</> : "Geen"}</b>
        </div>
        <button onClick={onJump} className="hw-start">
          <small>Start</small>
          <b>{startLabel ? startLabel.split(",")[0] : "Kies startpunt"}</b>
        </button>
      </div>
    </div>
  );
}
