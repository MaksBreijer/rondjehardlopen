export interface LatLng {
  lat: number;
  lng: number;
}

export type Category = "coffee" | "bakery" | "supermarket" | "green" | "surprise";
/** finish: the stop is near the finish, a reward at the end of the run.
 * midway: stop somewhere on the loop. turnaround: destination is the far point, the way back differs. */
export type StopMode = "midway" | "turnaround" | "finish";
/** visit: the route ends a leg exactly at the place. pass: the route only has to run past it. */
export type VisitMode = "visit" | "pass";

export interface Prefs {
  green: boolean;
  quiet: boolean;
}

/** A full marathon: the longest round we plan. */
export const MARATHON_KM = 42.195;
export const DISTANCES_KM = [3, 5, 7.5, 10, 15, 20] as const;

/* ---- Local businesses (prepared for partnerships, see ARCHITECTURE.md) ---- */

export interface Offer {
  id: string;
  title: string;
  description: string;
  /** ISO dates, inclusive */
  validFrom: string;
  validUntil: string;
}

export interface Promotion {
  tier: "sponsored";
  validFrom: string;
  validUntil: string;
}

export interface Business {
  id: string;
  name: string;
  category: Category;
  location: LatLng;
  address?: string;
  openingHours?: string;
  website?: string;
  welcomesRunners?: boolean;
  offers: Offer[];
  promotion?: Promotion;
}

export interface Poi {
  id: string;
  name: string;
  category: Category;
  /** human readable kind, e.g. "Café", "Park" */
  kind: string;
  location: LatLng;
  address?: string;
  /** raw OSM opening_hours string, only present when OSM has one */
  openingHours?: string;
  website?: string;
  source: "osm" | "partner";
  /** true only for an active paid promotion. Never influences route quality or candidate ranking. */
  sponsored: boolean;
  offers: Offer[];
  osmUrl?: string;
}

export interface PathStats {
  /** share 0..1 of the route over paths, footways, tracks, cycleways, pedestrian areas */
  carFreeShare: number;
  stepsM: number;
  /** share 0..1 over busy roads (primary/secondary/trunk) without a separate path; undefined = unknown */
  busyShare?: number;
}

export interface RouteResult {
  id: string;
  title: string;
  badge: string;
  description: string;
  distanceM: number;
  durationS: number;
  /** relative deviation from requested distance, e.g. 0.03 = 3% */
  deviation: number;
  geometry: LatLng[];
  start: LatLng;
  stop?: Poi;
  /** distance along the route where the stop is reached */
  stopAtM?: number;
  /** how far the route passes from the stop */
  stopOffsetM?: number;
  features: string[];
  stats?: PathStats;
  selfOverlap: number;
}

export interface StopAlternative {
  poi: Poi;
  crowDistanceM: number;
  /** smallest offered distance in which this stop could fit */
  minDistanceKm: number | null;
}

export interface GenerateResponse {
  routes: RouteResult[];
  targetM: number;
  warnings: string[];
  provider: string;
  /** number of complete round trips that were calculated and compared */
  evaluated?: number;
}

export interface ApiError {
  error: {
    code: "BAD_REQUEST" | "NO_STOP" | "ROUTING_FAILED" | "POI_UNAVAILABLE" | "RATE_LIMITED" | "NOT_CONFIGURED";
    message: string;
    alternatives?: StopAlternative[];
  };
}

export interface RouteRequest {
  start: LatLng;
  distanceKm: number;
  category: Category | null;
  stopMode: StopMode;
  visit: VisitMode;
  prefs: Prefs;
  seed: number;
  paceSecPerKm?: number;
}
