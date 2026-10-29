import type { RouteRequest } from "./types";

const CATS = ["coffee", "bakery", "supermarket", "green", "surprise"];
const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export function parseRequest(b: any): RouteRequest | string {
  if (!b || typeof b !== "object") return "Ongeldige aanvraag";
  if (!isNum(b.start?.lat) || !isNum(b.start?.lng) || Math.abs(b.start.lat) > 90 || Math.abs(b.start.lng) > 180) return "Startlocatie ontbreekt of is ongeldig";
  if (!isNum(b.distanceKm) || b.distanceKm < 1.5 || b.distanceKm > 30) return "Kies een afstand tussen 1 en 30 km";
  if (b.category != null && !CATS.includes(b.category)) return "Onbekende bestemmingscategorie";
  return {
    start: { lat: b.start.lat, lng: b.start.lng },
    distanceKm: b.distanceKm,
    category: b.category ?? null,
    stopMode: b.stopMode === "turnaround" || b.stopMode === "finish" ? b.stopMode : "midway",
    visit: b.visit === "pass" ? "pass" : "visit",
    prefs: { green: !!b.prefs?.green, quiet: !!b.prefs?.quiet },
    seed: isNum(b.seed) ? Math.floor(b.seed) % 100000 : 0,
    paceSecPerKm: isNum(b.paceSecPerKm) ? Math.min(900, Math.max(180, b.paceSecPerKm)) : 360,
  };
}

