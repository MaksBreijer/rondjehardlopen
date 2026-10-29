import type { LatLng, Prefs } from "../types";
import { RoutingError, type RoutedPath, type Router, type Waypoint } from "./types";

const DOWN_FOR_MS = 60_000;

/** Uses `primary`; if it is unreachable (network error / 5xx), switches to `secondary` for a minute. */
export class FallbackRouter implements Router {
  private downUntil = 0;
  constructor(
    private primary: Router,
    private secondary: Router,
  ) {}
  get name() {
    return Date.now() < this.downUntil ? this.secondary.name : this.primary.name;
  }

  async route(w: Waypoint[], prefs: Prefs, signal?: AbortSignal): Promise<RoutedPath> {
    if (Date.now() >= this.downUntil) {
      try {
        return await this.primary.route(w, prefs, signal);
      } catch (e) {
        const unreachable = e instanceof RoutingError && e.retriable && e.status !== 429;
        if (!unreachable) throw e;
        this.downUntil = Date.now() + DOWN_FOR_MS;
      }
    }
    return this.secondary.route(w, prefs, signal);
  }

  async stats(g: LatLng[], signal?: AbortSignal) {
    if (Date.now() < this.downUntil || !this.primary.stats) return null;
    return this.primary.stats(g, signal);
  }
}
