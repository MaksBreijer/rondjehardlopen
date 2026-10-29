import type { LatLng, PathStats, Prefs } from "../types";

export interface Waypoint extends LatLng {
  /** break = a real stop, through = just pass by */
  kind: "break" | "through";
}

export interface RoutedPath {
  distanceM: number;
  durationS: number;
  geometry: LatLng[];
  stats?: PathStats;
}

export class RoutingError extends Error {
  constructor(
    message: string,
    public status?: number,
    public retriable = false,
  ) {
    super(message);
  }
}

export interface Router {
  name: string;
  route(waypoints: Waypoint[], prefs: Prefs, signal?: AbortSignal): Promise<RoutedPath>;
  /** Optional: classify an already computed route (paths vs roads, steps). */
  stats?(geometry: LatLng[], signal?: AbortSignal): Promise<PathStats | null>;
}
