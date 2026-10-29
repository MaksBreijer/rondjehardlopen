import { sampleEvenly } from "../geo";
import type { RouteResult } from "../types";

/** Navigation apps accept only a handful of waypoints, so the loop is sampled. */
function via(route: RouteResult, n = 8) {
  return sampleEvenly(route.geometry, n + 2).slice(1, -1);
}

export function googleMapsUrl(route: RouteResult): string {
  const s = `${route.start.lat},${route.start.lng}`;
  const w = via(route).map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|");
  return `https://www.google.com/maps/dir/?api=1&travelmode=walking&origin=${s}&destination=${s}&waypoints=${encodeURIComponent(w)}`;
}

export function appleMapsUrl(route: RouteResult): string {
  const s = `${route.start.lat},${route.start.lng}`;
  const w = via(route, 6).map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`);
  return `https://maps.apple.com/?dirflg=w&saddr=${s}&daddr=${[...w, s].join("+to:")}`;
}

export function downloadText(filename: string, text: string, type = "application/gpx+xml") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
