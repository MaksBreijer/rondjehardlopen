import type { LatLng } from "../types";
import { fetchJson } from "./http";
import { RoutingError, type RoutedPath, type Router, type Waypoint } from "./types";

/** Keyless OSRM with the foot profile (FOSSGIS). No road-class info, so no busy-road analysis. */
export class OsrmFootRouter implements Router {
  name = "osrm-foot";
  constructor(private baseUrl = process.env.OSRM_FOOT_URL || "https://routing.openstreetmap.de/routed-foot") {}

  async route(waypoints: Waypoint[]): Promise<RoutedPath> {
    const coords = waypoints.map((w) => `${w.lng.toFixed(6)},${w.lat.toFixed(6)}`).join(";");
    const json = (await fetchJson(`${this.baseUrl}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`, {
      headers: { "User-Agent": "RondjeHardlopen/0.1" },
    })) as { code: string; routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] };
    const r = json.routes?.[0];
    if (json.code !== "Ok" || !r) throw new RoutingError(`OSRM: ${json.code}`);
    const geometry: LatLng[] = r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    // OSRM foot reports walking duration; the app recomputes time from the user's pace anyway
    return { distanceM: r.distance, durationS: r.duration, geometry };
  }
}
