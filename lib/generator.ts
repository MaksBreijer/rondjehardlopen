import { CATEGORIES, categoryInfo } from "./categories";
import { kmLabel } from "./format";
import { alongPathTo, bearing, destination, haversine, midpoint, minDistanceToPath, pairOverlap, pathLength, selfOverlap, simplify } from "./geo";
import type { Router, RoutedPath, Waypoint } from "./providers/types";
import { RoutingError } from "./providers/types";
import {
  DISTANCES_KM,
  type ApiError,
  type Category,
  type LatLng,
  type PathStats,
  type Poi,
  type RouteRequest,
  type RouteResult,
  type StopAlternative,
} from "./types";

export class GenerateError extends Error {
  constructor(
    public code: ApiError["error"]["code"],
    message: string,
    public alternatives?: StopAlternative[],
  ) {
    super(message);
  }
}

export interface Deps {
  router: Router;
  findPois: (category: Category, center: LatLng, radiusM: number) => Promise<Poi[]>;
  /** wall clock budget for routing calls */
  budgetMs?: number;
  /** "high" searches more candidates; use it with your own routing server or API key. Public demo servers get "normal". */
  effort?: "normal" | "high";
}

/** Typical ratio between routed distance and straight line distance. Refined while routing. */
const DEFAULT_DETOUR = 1.3;
const TOLERANCE = 0.04;
/** routes further off than this are never shown */
const MAX_DEVIATION = 0.2;
/** how many of the best candidates get a (slower) road-quality check */
const SHORTLIST = 9;

function rng(seed: number) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------ shapes ------------------------------ */

interface Shape {
  /** p is the free size parameter (metres) the solver tunes to reach the distance */
  build: (p: number) => Waypoint[];
  pMin: number;
  pMax: number;
  stop?: Poi;
}

const wp = (p: LatLng, kind: Waypoint["kind"] = "through"): Waypoint => ({ lat: p.lat, lng: p.lng, kind });
const crow = (w: Waypoint[]) => w.reduce((s, p, i) => (i ? s + haversine(w[i - 1], p) : 0), 0);

/** Parks and forests are areas: their centre point can be unreachable, so we route "through" it instead of stopping exactly there. */
const stopKind = (stop: Poi, visit: "visit" | "pass"): Waypoint["kind"] => (visit === "visit" && stop.category !== "green" ? "break" : "through");

/** Triangle start -> A -> B -> start without a stop. */
function loopShape(start: LatLng, theta: number): Shape {
  return {
    pMin: 100,
    pMax: 12000,
    build: (r) => [wp(start, "break"), wp(destination(start, theta, r)), wp(destination(start, theta + 60, r)), wp(start, "break")],
  };
}

/** start -> stop -> V -> start. V sits to one side of the line start-stop. */
function stopTriangle(start: LatLng, stop: Poi, side: 1 | -1, visit: "visit" | "pass"): Shape {
  const b = bearing(start, stop.location);
  return {
    stop,
    pMin: 100,
    pMax: 14000,
    build: (r) => [
      wp(start, "break"),
      wp(stop.location, stopKind(stop, visit)),
      wp(destination(start, b + side * 75, r)),
      wp(start, "break"),
    ],
  };
}

/** start -> A -> B -> stop -> start, with the stop close to the start: coffee as the reward at the end. */
function finishShape(start: LatLng, stop: Poi, side: 1 | -1, visit: "visit" | "pass"): Shape {
  const away = bearing(start, stop.location) + 180;
  return {
    stop,
    pMin: 150,
    pMax: 12000,
    build: (r) => [
      wp(start, "break"),
      wp(destination(start, away - side * 60, r)),
      wp(destination(start, away + side * 60, r)),
      wp(stop.location, stopKind(stop, visit)),
      wp(start, "break"),
    ],
  };
}

/** start -> A -> stop -> B -> start with A and B on opposite sides: the way back differs from the way out. */
function turnaroundShape(start: LatLng, stop: Poi, side: 1 | -1, visit: "visit" | "pass"): Shape {
  const b = bearing(start, stop.location);
  const mid = midpoint(start, stop.location);
  return {
    stop,
    pMin: 120,
    pMax: 9000,
    build: (w) => [
      wp(start, "break"),
      wp(destination(mid, b + 90 * side, w)),
      wp(stop.location, stopKind(stop, visit)),
      wp(destination(mid, b - 90 * side, w)),
      wp(start, "break"),
    ],
  };
}

/** Find p so the straight-line length of the waypoint chain is `target` (monotone in p, bisection). */
export function solveParam(shape: Shape, targetCrow: number): number | null {
  let lo = shape.pMin;
  let hi = shape.pMax;
  if (crow(shape.build(lo)) > targetCrow) return null;
  if (crow(shape.build(hi)) < targetCrow) return hi;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (crow(shape.build(mid)) < targetCrow) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ----------------------------- stop choice ----------------------------- */

/**
 * Rank candidate stops by how well their distance from the start fits the route length.
 * Pure function of distance, name, seed jitter. `sponsored` is deliberately NOT an input.
 */
export function rankStops(
  pois: Poi[],
  start: LatLng,
  targetM: number,
  mode: "midway" | "turnaround" | "finish",
  seed: number,
  count = 3,
): Poi[] {
  const rand = rng(seed + 17);
  const finish = mode === "finish";
  const maxD = finish ? Math.min(1200, targetM * 0.15) : targetM / (2 * 1.25);
  const minD = finish ? 120 : Math.max(350, targetM * 0.1);
  const ideal = finish ? 450 : mode === "midway" ? targetM * 0.27 : targetM * 0.34;
  const fit = pois
    .map((p) => ({ p, d: haversine(start, p.location) }))
    .filter((x) => x.d >= minD && x.d <= maxD)
    .map((x) => ({ ...x, score: Math.abs(x.d - ideal) / targetM + rand() * 0.08 }))
    .sort((a, b) => a.score - b.score);
  const chosen: typeof fit = [];
  for (const c of fit) {
    if (chosen.every((o) => haversine(o.p.location, c.p.location) > 250)) chosen.push(c);
    if (chosen.length >= count) break;
  }
  return chosen.map((c) => c.p);
}

function alternativesFor(pois: Poi[], start: LatLng): StopAlternative[] {
  return pois
    .slice(0, 3)
    .map((poi) => {
      const crowDistanceM = haversine(start, poi.location);
      const need = (crowDistanceM * 2 * 1.3) / 1000;
      const fits = DISTANCES_KM.find((d) => d >= need) ?? null;
      return { poi, crowDistanceM, minDistanceKm: fits };
    });
}

/* ----------------------------- refinement ----------------------------- */

interface Candidate {
  shape: Shape;
  path: RoutedPath;
  deviation: number;
  self: number;
  stats?: PathStats;
}

class Budget {
  private end: number;
  constructor(ms: number) {
    this.end = Date.now() + ms;
  }
  get expired() {
    return Date.now() > this.end;
  }
}

async function refine(
  shape: Shape,
  targetM: number,
  deps: Deps,
  prefs: RouteRequest["prefs"],
  detour: { f: number },
  budget: Budget,
  errors: unknown[],
): Promise<Candidate | null> {
  let p = solveParam(shape, targetM / detour.f);
  if (p === null) return null;
  let best: Candidate | null = null;
  let prev: { p: number; m: number } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (budget.expired) break;
    const wps = shape.build(p);
    let path: RoutedPath;
    try {
      path = await deps.router.route(wps, prefs);
    } catch (e) {
      errors.push(e);
      break;
    }
    const m = path.distanceM;
    const c = crow(wps);
    if (c > 0 && m > 0) detour.f = detour.f * 0.7 + (m / c) * 0.3;
    const dev = (m - targetM) / targetM;
    if (!best || Math.abs(dev) < Math.abs(best.deviation)) {
      best = { shape, path, deviation: dev, self: selfOverlap(path.geometry) };
    }
    if (Math.abs(dev) <= TOLERANCE) break;
    let next: number;
    if (prev && Math.abs(m - prev.m) > 50) {
      next = p + ((targetM - m) * (p - prev.p)) / (m - prev.m); // secant
    } else {
      next = p * (targetM / m);
    }
    prev = { p, m };
    p = Math.min(shape.pMax, Math.max(shape.pMin, next));
    if (Math.abs(p - prev.p) < 20) break;
  }
  return best;
}

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) {
        const mine = i++;
        out[mine] = await fn(items[mine]);
      }
    }),
  );
  return out;
}

/* ------------------------------ generation ------------------------------ */

export async function generateRoutes(req: RouteRequest, deps: Deps): Promise<{ routes: RouteResult[]; targetM: number; warnings: string[]; evaluated: number }> {
  const targetM = req.distanceKm * 1000;
  const rand = rng(req.seed);
  const warnings: string[] = [];
  const budget = new Budget(deps.budgetMs ?? 38000);
  const detour = { f: DEFAULT_DETOUR };
  let category = req.category;

  /* 1. shapes */
  const shapes: Shape[] = [];
  let chosenCategory: Category | null = category;
  if (category) {
    if (category === "surprise") {
      // a surprise can be any interesting place, a bit of randomness is the point
      chosenCategory = "surprise";
    }
    const radius = req.stopMode === "finish" ? 1500 : targetM / (2 * 1.25);
    let pois: Poi[];
    try {
      pois = await deps.findPois(chosenCategory!, req.start, radius);
    } catch {
      throw new GenerateError(
        "POI_UNAVAILABLE",
        "De zoekdienst voor bestemmingen (OpenStreetMap Overpass) is nu niet bereikbaar. Probeer het zo opnieuw of maak een rondje zonder bestemming.",
      );
    }
    const wanted = deps.effort === "high" ? (chosenCategory === "green" ? 6 : 5) : 3;
    const ranked = rankStops(pois, req.start, targetM, req.stopMode, req.seed, wanted + (deps.effort === "high" ? 4 : 2));
    // Feasibility probe: a stop behind water or a railway can be close as the crow flies but far on foot.
    const probed = await pool(ranked, 4, async (poi) => {
      try {
        const r = await deps.router.route([wp(req.start, "break"), wp(poi.location, stopKind(poi, req.visit))], req.prefs);
        return { poi, ok: r.distanceM <= targetM * 0.5 * 0.95 };
      } catch {
        return { poi, ok: true }; // unknown: let the full routing decide
      }
    });
    const stops = probed.filter((x) => x.ok).map((x) => x.poi).slice(0, wanted);
    if (!stops.length) {
      let wider: Poi[] = [];
      try {
        wider = await deps.findPois(chosenCategory!, req.start, req.stopMode === "finish" ? 3000 : 7500);
      } catch {
        /* alternatives are optional */
      }
      const label = categoryInfo(chosenCategory!).label.toLowerCase();
      throw new GenerateError(
        "NO_STOP",
        req.stopMode === "finish"
          ? `Geen ${label}-plek vlak bij je startpunt (binnen ca. 1,2 km) om als afsluiter te gebruiken. Kies een tussenstop of een andere bestemming.`
          : wider.length
          ? `Geen ${label}-bestemming past in ${kmLabel(req.distanceKm)} km vanaf dit startpunt. Deze liggen verder weg:`
          : `Geen ${label}-bestemming gevonden in de buurt van dit startpunt.`,
        req.stopMode === "finish" ? [] : alternativesFor(wider, req.start),
      );
    }
    for (const stop of stops) {
      for (const side of [1, -1] as const) {
        shapes.push(
          req.stopMode === "midway"
            ? stopTriangle(req.start, stop, side, req.visit)
            : req.stopMode === "finish"
              ? finishShape(req.start, stop, side, req.visit)
              : turnaroundShape(req.start, stop, side, req.visit),
        );
      }
    }
  } else {
    const base = rand() * 360;
    const n = deps.effort === "high" ? 10 : 6;
    for (let i = 0; i < n; i++) shapes.push(loopShape(req.start, base + i * (360 / n)));
  }

  /* 2. route + refine */
  const errors: unknown[] = [];
  const results = await pool(shapes, deps.effort === "high" ? 4 : 2, (s) => refine(s, targetM, deps, req.prefs, detour, budget, errors));
  const cands = results.filter((c): c is Candidate => !!c);
  if (!cands.length) {
    const rate = errors.find((e) => e instanceof RoutingError && e.status === 429);
    if (rate) throw new GenerateError("RATE_LIMITED", "De routeservice is druk (te veel aanvragen). Probeer het over een minuut opnieuw.");
    const msg = errors[0] instanceof Error ? errors[0].message : "onbekende fout";
    throw new GenerateError("ROUTING_FAILED", `Er kon geen route berekend worden (${deps.router.name}: ${msg}).`);
  }

  /* 3. pick up to three clearly different routes */
  const geoScore = (c: Candidate) => Math.abs(c.deviation) * 100 + c.self * 40;
  const viable = cands.filter((c) => Math.abs(c.deviation) <= MAX_DEVIATION).sort((a, b) => geoScore(a) - geoScore(b));
  if (!viable.length) {
    throw new GenerateError(
      "ROUTING_FAILED",
      "Er is geen rondje gevonden dat redelijk dicht bij de gewenste afstand komt (vaak door water, spoor of een onbereikbare bestemming). Probeer een andere afstand of bestemming, of 'Nieuwe alternatieven'.",
    );
  }

  /* 3a. quality check: classify the best candidates (paths vs. busy roads, steps) */
  const shortlist = viable.slice(0, deps.effort === "high" ? SHORTLIST : 6);
  await pool(shortlist, 3, async (c) => {
    c.stats = c.path.stats ?? (deps.router.stats ? ((await deps.router.stats(c.path.geometry).catch(() => null)) ?? undefined) : undefined);
  });
  // Quiet matters most: busy roads weigh heavily, car-free stretches give a bonus.
  const score = (c: Candidate) =>
    geoScore(c) + (c.stats ? (c.stats.busyShare ?? 0) * 90 + (c.stats.stepsM > 20 ? 6 : 0) - c.stats.carFreeShare * (req.prefs.green || req.prefs.quiet ? 25 : 12) : 0);
  let ordered = [...shortlist].sort((a, b) => score(a) - score(b));
  const calm = ordered.filter((c) => (c.stats?.busyShare ?? 0) <= 0.2);
  if (calm.length >= 2) ordered = calm; // never offer a busy route when calm ones exist

  /* 3b. pick up to three clearly different routes */
  const picked: Candidate[] = [];
  const remaining = [...ordered];
  while (picked.length < 3 && remaining.length) {
    let bestIdx = -1;
    let bestVal = Infinity;
    remaining.forEach((c, i) => {
      const overlap = picked.length ? Math.max(...picked.map((p) => pairOverlap(c.path.geometry, p.path.geometry))) : 0;
      if (picked.length && overlap > 0.6) return;
      const sameStop = picked.some((p) => p.shape.stop && p.shape.stop.id === c.shape.stop?.id);
      const val = score(c) + overlap * 60 + (sameStop ? 8 : 0);
      if (val < bestVal) {
        bestVal = val;
        bestIdx = i;
      }
    });
    if (bestIdx === -1) break;
    picked.push(remaining.splice(bestIdx, 1)[0]);
  }
  if (!picked.length) picked.push(ordered[0]);

  /* 4. describe */
  const pace = req.paceSecPerKm ?? 360;
  const routes = picked.map((c, i) => describe(c, c.stats, req, pace, i));
  labelBadges(routes);
  const bestDev = Math.min(...routes.map((r) => Math.abs(r.deviation)));
  if (bestDev > 0.05) {
    warnings.push(
      `Het wegennet liet geen route toe die binnen 5% van ${kmLabel(req.distanceKm)} km blijft. De dichtstbijzijnde wijkt ${Math.round(bestDev * 100)}% af.`,
    );
  }
  if (deps.router.name.startsWith("osrm")) {
    warnings.push("De hoofd-routeservice is nu niet bereikbaar. Deze rondjes komen van een reserveservice: zonder voorkeur voor groen/rustig en zonder controle op drukke wegen.");
    routes.forEach((r) => (r.features = r.features.filter((f) => !f.startsWith("Gekozen met voorkeur"))));
  }
  if (routes.length < 3) warnings.push("Er zijn minder dan drie duidelijk verschillende rondjes gevonden. Probeer 'Nieuwe alternatieven'.");
  return { routes, targetM, warnings, evaluated: cands.length };
}

function describe(c: Candidate, stats: PathStats | undefined, req: RouteRequest, pace: number, i: number): RouteResult {
  const geometry = simplify(c.path.geometry, 3);
  const distanceM = c.path.distanceM;
  const stop = c.shape.stop;
  const km = (distanceM / 1000).toFixed(1).replace(".", ",");
  const features: string[] = [];
  if (stats) {
    features.push(`${Math.round(stats.carFreeShare * 100)}% autovrij (paden, voetgangersgebied, fietspad)`);
    if (stats.busyShare !== undefined) features.push(stats.busyShare < 0.05 ? "Vrijwel geen drukke wegen" : `${Math.round(stats.busyShare * 100)}% langs drukkere wegen`);
    if (stats.stepsM > 20) features.push("Bevat trappen");
    else features.push("Zonder trappen");
  }
  features.push(c.self < 0.08 ? "Weinig dezelfde weg dubbel" : `${Math.round(c.self * 100)}% dezelfde weg dubbel`);
  if (req.prefs.green) features.push("Gekozen met voorkeur voor groen");
  if (req.prefs.quiet) features.push("Gekozen met voorkeur voor rustige straten");

  let title: string;
  let stopAtM: number | undefined;
  let stopOffsetM: number | undefined;
  let description: string;
  if (stop) {
    const info = categoryInfo(stop.category);
    title = info.routeName;
    stopAtM =
      req.stopMode === "finish"
        ? pathLength(geometry) - alongPathTo(stop.location, [...geometry].reverse())
        : alongPathTo(stop.location, geometry);
    stopOffsetM = minDistanceToPath(stop.location, geometry);
    const when = `na ca. ${(stopAtM / 1000).toFixed(1).replace(".", ",")} km`;
    description =
      req.stopMode === "finish"
        ? `Rondje van ${km} km met ${info.noun} als afsluiter bij ${stop.name}, ${when}.`
        : req.stopMode === "midway"
        ? `Rondje van ${km} km met ${info.noun} bij ${stop.name}, ${when}.`
        : `Rondje van ${km} km naar ${stop.name} (${when}) en via een andere weg terug.`;
    if (req.visit === "pass") description += " De route loopt langs de plek, je hoeft niet te stoppen.";
  } else {
    const carFree = stats?.carFreeShare ?? 0;
    title = carFree >= 0.5 ? "Het rustige rondje" : "Het rondje";
    description = `Rondje van ${km} km vanaf je startpunt, zonder bestemming.`;
  }
  const withKm = `${title} - ${kmLabel(Math.round((distanceM / 1000) * 10) / 10)} km`;
  return {
    id: `r${req.seed}-${i}`,
    title: withKm,
    badge: "",
    description,
    distanceM,
    durationS: (distanceM / 1000) * pace,
    deviation: c.deviation,
    geometry,
    start: req.start,
    stop,
    stopAtM,
    stopOffsetM,
    features,
    stats,
    selfOverlap: c.self,
  };
}

/** Distinguish the options by what they are actually best at. */
function labelBadges(routes: RouteResult[]) {
  const closest = routes.reduce((a, b) => (Math.abs(a.deviation) <= Math.abs(b.deviation) ? a : b));
  closest.badge = "Dichtst bij je afstand";
  const withStats = routes.filter((r) => !r.badge && r.stats);
  if (withStats.length) {
    const greenest = withStats.reduce((a, b) => (a.stats!.carFreeShare >= b.stats!.carFreeShare ? a : b));
    greenest.badge = "Meeste paden";
  }
  routes.filter((r) => !r.badge).forEach((r, i) => (r.badge = i === 0 ? "Andere kant op" : "Verrassend anders"));
}

export { CATEGORIES, pathLength };
