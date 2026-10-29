"use client";

import { useState } from "react";
import Icon from "./Icon";
import type { LatLng } from "@/lib/types";

export interface StartPoint {
  location: LatLng;
  label: string;
}

export default function StartPicker({ value, onChange }: { value: StartPoint | null; onChange: (s: StartPoint) => void }) {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<StartPoint[]>([]);
  const [busy, setBusy] = useState<"geo" | "search" | null>(null);
  const [error, setError] = useState("");

  function locate() {
    setError("");
    if (!("geolocation" in navigator)) return setError("Je browser ondersteunt geen locatie. Voer hieronder een adres in.");
    setBusy("geo");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        onChange({ location, label: "Mijn locatie" });
        setPlaces([]);
        setBusy(null);
        try {
          const res = await fetch(`/api/geocode?lat=${location.lat}&lng=${location.lng}`);
          const j = await res.json();
          if (j.label) onChange({ location, label: j.label });
        } catch {
          /* label stays "Mijn locatie" */
        }
      },
      (e) => {
        setBusy(null);
        setError(
          e.code === 1
            ? "Locatietoegang is geweigerd. Geen probleem: voer hieronder je adres in."
            : "Je locatie kon niet bepaald worden. Voer hieronder je adres in.",
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 3) return setError("Typ minstens 3 tekens van je adres.");
    setError("");
    setBusy("search");
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Zoeken mislukt");
      const found: StartPoint[] = j.places.map((p: any) => ({ location: p.location, label: p.label }));
      setPlaces(found);
      if (!found.length) setError("Geen adres gevonden. Probeer straat, huisnummer en plaats.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zoeken mislukt");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <button className="btn green big" onClick={locate} disabled={busy === "geo"}>
        <Icon name="home" /> {busy === "geo" ? "Locatie zoeken…" : "Vanaf mijn voordeur"}
      </button>
      <div className="or">of voer een startadres in</div>
      <form className="row" onSubmit={search}>
        <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Straat, huisnummer, plaats" aria-label="Startadres" autoComplete="street-address" />
        <button className="btn" type="submit" disabled={busy === "search"}>{busy === "search" ? "…" : "Zoek"}</button>
      </form>
      {places.length > 0 && (
        <ul className="places">
          {places.map((p, i) => (
            <li key={i}>
              <button
                onClick={() => {
                  onChange(p);
                  setPlaces([]);
                }}
              >
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <div className="notice err" role="alert">{error}</div>}
      {value && <div className="chosen"><Icon name="check" /> Start en finish: <b>{value.label}</b></div>}
    </div>
  );
}
