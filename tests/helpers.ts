import { haversine } from "@/lib/geo";
import type { Router, Waypoint } from "@/lib/providers/types";
import type { Category, LatLng, Poi } from "@/lib/types";

/** Deterministic test double: straight lines between waypoints, 1.3x detour factor. Tests only. */
export const fakeRouter: Router = {
  name: "fake",
  async route(w: Waypoint[]) {
    let d = 0;
    for (let i = 1; i < w.length; i++) d += haversine(w[i - 1], w[i]);
    return {
      distanceM: d * 1.3,
      durationS: d * 1.3 * 0.36,
      geometry: w.map((p) => ({ lat: p.lat, lng: p.lng })),
      stats: { carFreeShare: 0.5, stepsM: 0 },
    };
  },
};

export const START: LatLng = { lat: 52.09, lng: 5.12 };

export function poi(id: string, name: string, loc: LatLng, category: Category = "coffee", extra: Partial<Poi> = {}): Poi {
  return { id, name, category, kind: "Café", location: loc, source: "osm", sponsored: false, offers: [], ...extra };
}
