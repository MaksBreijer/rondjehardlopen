import { pathLength } from "../geo";
import type { LatLng, PathStats, Prefs } from "../types";
import { fetchJson } from "./http";
import { RoutingError, type RoutedPath, type Router, type Waypoint } from "./types";

// ORS waytype codes: 4 path, 5 track, 6 cycleway, 7 footway, 8 steps
const CAR_FREE = new Set([4, 5, 6, 7]);

/** openrouteservice (hosted with API key, or self-hosted via ORS_URL). */
export class OrsRouter implements Router {
  name = "openrouteservice";
  constructor(
    private apiKey = process.env.ORS_API_KEY || "",
    private baseUrl = process.env.ORS_URL || "https://api.openrouteservice.org",
  ) {}

  async route(waypoints: Waypoint[], prefs: Prefs): Promise<RoutedPath> {
    const weightings: Record<string, { factor: number }> = {};
    if (prefs.green) weightings.green = { factor: 0.9 };
    if (prefs.quiet) weightings.quiet = { factor: 0.9 };
    const body = {
      coordinates: waypoints.map((w) => [w.lng, w.lat]),
      preference: "recommended",
      instructions: false,
      extra_info: ["waytype"],
      options: {
        avoid_features: ["ferries", "steps"],
        ...(Object.keys(weightings).length ? { profile_params: { weightings } } : {}),
      },
    };
    const json = (await fetchJson(`${this.baseUrl}/v2/directions/foot-walking/geojson`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: this.apiKey },
      body: JSON.stringify(body),
    })) as {
      features?: {
        geometry: { coordinates: [number, number][] };
        properties: {
          summary: { distance: number; duration: number };
          extras?: { waytype?: { values: [number, number, number][] } };
        };
      }[];
    };
    const f = json.features?.[0];
    if (!f) throw new RoutingError("openrouteservice gaf geen route terug");
    const geometry: LatLng[] = f.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    let stats: PathStats | undefined;
    const values = f.properties.extras?.waytype?.values;
    if (values) {
      let free = 0;
      let steps = 0;
      let total = 0;
      for (const [from, to, type] of values) {
        const m = pathLength(geometry.slice(from, to + 1));
        total += m;
        if (CAR_FREE.has(type)) free += m;
        if (type === 8) steps += m;
      }
      if (total) stats = { carFreeShare: free / total, stepsM: steps };
    }
    return { distanceM: f.properties.summary.distance, durationS: f.properties.summary.duration, geometry, stats };
  }
}
