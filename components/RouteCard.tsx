"use client";

import { useState } from "react";
import { duration } from "@/lib/format";
import type { RouteResult } from "@/lib/types";
import Icon from "./Icon";
import CountUp from "./CountUp";
import { buzz } from "@/lib/client/haptics";
import DeviceSheet from "./DeviceSheet";
import RunMode from "./RunMode";
import StopInfo from "./StopInfo";

interface Props {
  route: RouteResult;
  selected: boolean;
  hidden: boolean;
  saved: boolean;
  onSelect: () => void;
  onReveal: () => void;
  onSave: () => void;
  onShare: () => void;
  shareNote?: string;
}

export default function RouteCard({ route, selected, hidden, saved, onSelect, onReveal, onSave, onShare, shareNote }: Props) {
  const [run, setRun] = useState(false);
  const [device, setDevice] = useState(false);
  const dev = Math.round(route.deviation * 100);
  return (
    <article className={`card${selected ? " sel" : ""}`} aria-current={selected}>
      <span className="badge">{route.badge}</span>
      <h3>{route.title}</h3>
      <div className="nums">
        <span><CountUp meters={route.distanceM} /><small>{dev === 0 ? "exact doel" : `${dev > 0 ? "+" : ""}${dev}% t.o.v. doel`}</small></span>
        <span>{duration(route.durationS)}<small>geschatte looptijd</small></span>
      </div>
      <p>{route.description}</p>
      <StopInfo route={route} hidden={hidden} onReveal={onReveal} />
      <ul className="feat">
        {route.features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {!selected ? (
        <div className="actions">
          <button className="btn green" onClick={() => { buzz(); onSelect(); }}>Kies dit rondje</button>
        </div>
      ) : (
        <>
          <div className="actions">
            <button className="btn green" onClick={() => { buzz(14); onReveal(); setRun(true); }}><Icon name="play" /> Start</button>
            <button className="btn ghost" onClick={() => { onReveal(); setDevice(true); }}><Icon name="watch" /> Horloge</button>
            <button className="btn ghost" onClick={onSave}><Icon name={saved ? "bookmarkFill" : "bookmark"} /> {saved ? "Bewaard" : "Bewaar"}</button>
            <button className="btn ghost" onClick={onShare}><Icon name="share" /> Deel</button>
          </div>
          {shareNote && <div className="notice info">{shareNote}</div>}
          {run && <RunMode route={route} onClose={() => setRun(false)} />}
          {device && <DeviceSheet route={route} onClose={() => setDevice(false)} />}
        </>
      )}
    </article>
  );
}
