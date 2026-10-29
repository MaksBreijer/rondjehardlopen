import { decodePolyline, pathLength } from "../geo";
import type { LatLng, PathStats, Prefs } from "../types";
import { fetchJson } from "./http";
import { RoutingError, type RoutedPath, type Router, type Waypoint } from "./types";

const BUSY_CLASSES = new Set(["motorway", "trunk", "primary", "secondary"]);
const CAR_FREE_USES = new Set(["footway", "path", "pedestrian", "track", "cycleway", "mountain_bike", "bridleway", "pedestrian_crossing"]);

/** Keyless default: Valhalla pedestrian routing on OpenStreetMap data. */
export class ValhallaRouter implements Router {
  name = "valhalla";
  constructor(private baseUrl = process.env.VALHALLA_URL || "https://valhalla1.openstreetmap.de") {}

  private costing(prefs: Prefs) {
    // Always lean towards calm routes for running; stronger when the user asks for it.
    const o: Record<string, number> = { step_penalty: 120, use_ferry: 0, use_hills: 0.5, use_living_streets: 0.8, driveway_factor: 2, alley_factor: 2 };
    if (prefs.green) Object.assign(o, { walkway_factor: 0.6, use_tracks: 1, use_living_streets: 1 });
    if (prefs.quiet) Object.assign(o, { use_living_streets: 1, driveway_factor: 4, alley_factor: 3, sidewalk_factor: 1.1 });
    return { pedestrian: o };
  }

  async route(waypoints: Waypoint[], prefs: Prefs): Promise<RoutedPath> {
    const body = {
      locations: waypoints.map((w) => ({ lat: w.lat, lon: w.lng, type: w.kind })),
      costing: "pedestrian",
      costing_options: this.costing(prefs),
      directions_options: { units: "kilometers" },
    };
    const json = (await fetchJson(`${this.baseUrl}/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "RondjeHardlopen/0.1" },
      body: JSON.stringify(body),
    })) as { trip?: { summary: { length: number; time: number }; legs: { shape: string }[] } };
    if (!json.trip) throw new RoutingError("Valhalla gaf geen route terug");
    const geometry: LatLng[] = [];
    json.trip.legs.forEach((leg, i) => {
      const pts = decodePolyline(leg.shape, 6);
      geometry.push(...(i === 0 ? pts : pts.slice(1)));
    });
    return { distanceM: json.trip.summary.length * 1000 || pathLength(geometry), durationS: json.trip.summary.time, geometry };
  }

  async stats(geometry: LatLng[]): Promise<PathStats | null> {
    try {
      const json = (await fetchJson(
        `${this.baseUrl}/trace_attributes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "User-Agent": "RondjeHardlopen/0.1" },
          body: JSON.stringify({
            shape: geometry.map((p) => ({ lat: p.lat, lon: p.lng })),
            costing: "pedestrian",
            shape_match: "walk_or_snap",
            filters: { attributes: ["edge.use", "edge.length", "edge.road_class"], action: "include" },
          }),
        },
        20000,
        0,
      )) as { edges?: { use: string; length: number; road_class?: string }[] };
      if (!json.edges?.length) return null;
      let total = 0;
      let free = 0;
      let steps = 0;
      let busy = 0;
      for (const e of json.edges) {
        const m = e.length * 1000;
        total += m;
        if (CAR_FREE_USES.has(e.use)) free += m;
        if (e.use === "steps") steps += m;
        if (!CAR_FREE_USES.has(e.use) && e.road_class && BUSY_CLASSES.has(e.road_class)) busy += m;
      }
      return total ? { carFreeShare: free / total, stepsM: steps, busyShare: busy / total } : null;
    } catch {
      return null;
    }
  }
}
