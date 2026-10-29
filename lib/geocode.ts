import { fetchJson } from "./providers/http";
import type { LatLng } from "./types";

const BASE = process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org";
const UA = process.env.NOMINATIM_USER_AGENT || "RondjeHardlopen/0.1 (contact: zie README)";

export interface Place {
  label: string;
  location: LatLng;
}

const cache = new Map<string, { at: number; value: Place[] }>();
let last = 0;

async function throttled<T>(fn: () => Promise<T>): Promise<T> {
  // Nominatim usage policy: max 1 request per second
  const wait = Math.max(0, last + 1100 - Date.now());
  last = Date.now() + wait;
  if (wait) await new Promise((r) => setTimeout(r, wait));
  return fn();
}

export async function search(q: string): Promise<Place[]> {
  const key = "s:" + q.toLowerCase().trim();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 3600_000) return hit.value;
  const country = process.env.GEOCODE_COUNTRIES ?? "nl,be";
  const url = `${BASE}/search?format=jsonv2&limit=5&addressdetails=0&q=${encodeURIComponent(q)}${country ? `&countrycodes=${country}` : ""}`;
  const json = (await throttled(() => fetchJson(url, { headers: { "User-Agent": UA, "Accept-Language": "nl" } }, 10000, 0))) as {
    display_name: string;
    lat: string;
    lon: string;
  }[];
  const value = json.map((r) => ({ label: r.display_name, location: { lat: +r.lat, lng: +r.lon } }));
  cache.set(key, { at: Date.now(), value });
  return value;
}

export async function reverse(p: LatLng): Promise<string | null> {
  const key = `r:${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit) return hit.value[0]?.label ?? null;
  const url = `${BASE}/reverse?format=jsonv2&zoom=18&lat=${p.lat}&lon=${p.lng}`;
  try {
    const json = (await throttled(() => fetchJson(url, { headers: { "User-Agent": UA, "Accept-Language": "nl" } }, 10000, 0))) as {
      display_name?: string;
      address?: Record<string, string>;
    };
    const a = json.address ?? {};
    const street = [a.road, a.house_number].filter(Boolean).join(" ");
    const label = [street, a.city ?? a.town ?? a.village].filter(Boolean).join(", ") || json.display_name || null;
    if (label) cache.set(key, { at: Date.now(), value: [{ label, location: p }] });
    return label;
  } catch {
    return null;
  }
}
