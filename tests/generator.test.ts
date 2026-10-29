import { describe, expect, it } from "vitest";
import { GenerateError, generateRoutes, rankStops, solveParam } from "@/lib/generator";
import { destination, haversine, minDistanceToPath } from "@/lib/geo";
import { parseElements } from "@/lib/overpass";
import { parseRequest } from "@/lib/validate";
import type { RouteRequest } from "@/lib/types";
import { fakeRouter, poi, START } from "./helpers";

const base: RouteRequest = {
  start: START,
  distanceKm: 10,
  category: null,
  stopMode: "midway",
  visit: "visit",
  prefs: { green: false, quiet: false },
  seed: 1,
};

describe("loop without stop", () => {
  for (const km of [3, 5, 7.5, 10, 15, 20]) {
    it(`${km} km lands within 5% and is closed`, async () => {
      const { routes } = await generateRoutes({ ...base, distanceKm: km }, { router: fakeRouter, findPois: async () => [] });
      expect(routes.length).toBeGreaterThanOrEqual(1);
      for (const r of routes) {
        expect(Math.abs(r.deviation)).toBeLessThanOrEqual(0.05);
        expect(haversine(r.geometry[0], START)).toBeLessThan(1);
        expect(haversine(r.geometry.at(-1)!, START)).toBeLessThan(1);
      }
    });
  }
  it("returns at most three clearly different routes", async () => {
    const { routes } = await generateRoutes(base, { router: fakeRouter, findPois: async () => [] });
    expect(routes.length).toBeLessThanOrEqual(3);
    expect(new Set(routes.map((r) => r.badge)).size).toBe(routes.length);
  });
  it("a new seed gives different routes", async () => {
    const a = await generateRoutes({ ...base, seed: 1 }, { router: fakeRouter, findPois: async () => [] });
    const b = await generateRoutes({ ...base, seed: 2 }, { router: fakeRouter, findPois: async () => [] });
    expect(JSON.stringify(a.routes[0].geometry)).not.toEqual(JSON.stringify(b.routes[0].geometry));
  });
});

describe("route quality", () => {
  const busyEast = {
    ...fakeRouter,
    route: async (w: any, p: any) => {
      const { stats: _s, ...r } = await fakeRouter.route(w, p);
      return r;
    },
    stats: async (g: any[]) => ({ carFreeShare: 0.4, stepsM: 0, busyShare: g.some((p) => p.lng > START.lng + 0.01) ? 0.8 : 0.02 }),
  };
  it("avoids routes along busy roads when calm ones exist", async () => {
    const out = await generateRoutes(base, { router: busyEast, findPois: async () => [] });
    expect(out.evaluated).toBeGreaterThanOrEqual(out.routes.length);
    for (const r of out.routes) expect(r.stats!.busyShare).toBeLessThan(0.2);
    expect(out.routes.some((r) => r.features.some((f) => f.includes("drukke wegen")))).toBe(true);
  });
});

describe("routes with a stop", () => {
  const pois = [
    poi("a", "Koffie A", destination(START, 30, 1500)),
    poi("b", "Koffie B", destination(START, 150, 1700)),
    poi("c", "Koffie C", destination(START, 260, 1600)),
  ];
  for (const mode of ["midway", "turnaround"] as const) {
    it(`${mode}: stop is part of the route and distance is accurate`, async () => {
      const { routes } = await generateRoutes(
        { ...base, category: "coffee", stopMode: mode },
        { router: fakeRouter, findPois: async () => pois },
      );
      expect(routes.length).toBeGreaterThan(0);
      for (const r of routes) {
        expect(r.stop).toBeDefined();
        expect(minDistanceToPath(r.stop!.location, r.geometry)).toBeLessThan(25);
        expect(Math.abs(r.deviation)).toBeLessThanOrEqual(0.05);
        expect(r.stopAtM!).toBeGreaterThan(0);
        expect(r.stopAtM!).toBeLessThan(r.distanceM);
        expect(r.title).toContain("De koffiepauze");
      }
    });
  }
  it("turnaround uses a different way back (low self overlap)", async () => {
    const { routes } = await generateRoutes(
      { ...base, category: "coffee", stopMode: "turnaround" },
      { router: fakeRouter, findPois: async () => pois },
    );
    for (const r of routes) expect(r.selfOverlap).toBeLessThan(0.2);
  });
  it("NO_STOP with alternatives when the nearest place is too far", async () => {
    const far = [poi("far", "Verre Bakker", destination(START, 0, 4000), "bakery")];
    const calls: number[] = [];
    const err = await generateRoutes(
      { ...base, category: "bakery", distanceKm: 5 },
      { router: fakeRouter, findPois: async (_c, _p, radius) => (calls.push(radius), radius > 5000 ? far : []) },
    ).catch((e) => e);
    expect(err).toBeInstanceOf(GenerateError);
    expect(err.code).toBe("NO_STOP");
    expect(err.alternatives[0].poi.name).toBe("Verre Bakker");
    expect(err.alternatives[0].minDistanceKm).toBe(15);
  });
  it("POI_UNAVAILABLE when the POI service fails", async () => {
    const err = await generateRoutes(
      { ...base, category: "coffee" },
      { router: fakeRouter, findPois: async () => { throw new Error("down"); } },
    ).catch((e) => e);
    expect(err.code).toBe("POI_UNAVAILABLE");
  });
  it("ROUTING_FAILED when the router fails", async () => {
    const broken = { name: "broken", route: async () => { throw new Error("boom"); } };
    const err = await generateRoutes(base, { router: broken, findPois: async () => [] }).catch((e) => e);
    expect(err.code).toBe("ROUTING_FAILED");
  });
  it("drops stops that are close as the crow flies but far on foot", async () => {
    const water = poi("w", "Overkant", destination(START, 0, 1500));
    const ok = poi("ok", "Aan deze kant", destination(START, 180, 1500));
    const router = {
      ...fakeRouter,
      route: async (w: any, p: any) => {
        const r = await fakeRouter.route(w, p);
        const touchesWater = w.some((x: any) => haversine(x, water.location) < 5);
        return touchesWater ? { ...r, distanceM: r.distanceM + 30000 } : r;
      },
    };
    const { routes } = await generateRoutes({ ...base, category: "coffee" }, { router, findPois: async () => [water, ok] });
    expect(routes.every((r) => r.stop!.id === "ok")).toBe(true);
  });
  it("refuses to show routes far off the requested distance", async () => {
    const wild = { ...fakeRouter, route: async (w: any) => ({ ...(await fakeRouter.route(w, { green: false, quiet: false })), distanceM: 25000 }) };
    const err = await generateRoutes(base, { router: wild, findPois: async () => [] }).catch((e) => e);
    expect(err.code).toBe("ROUTING_FAILED");
  });
  it("warns when the road network cannot reach 5%", async () => {
    const stubborn = { ...fakeRouter, route: async (w: any) => { const r = await fakeRouter.route(w, { green: false, quiet: false }); return { ...r, distanceM: 10800 + Math.random() * 10 }; } };
    const out = await generateRoutes(base, { router: stubborn, findPois: async () => [] });
    expect(out.warnings.join(" ")).toMatch(/5%/);
  });
});

describe("coffee at the finish", () => {
  const near = [poi("n1", "Koffie dichtbij", destination(START, 40, 500)), poi("n2", "Koffie naast de deur", destination(START, 200, 350))];
  it("ends the run next to the stop, closed loop, accurate distance", async () => {
    const { routes } = await generateRoutes({ ...base, category: "coffee", stopMode: "finish" }, { router: fakeRouter, findPois: async () => near });
    expect(routes.length).toBeGreaterThan(0);
    for (const r of routes) {
      expect(Math.abs(r.deviation)).toBeLessThanOrEqual(0.05);
      expect(haversine(r.geometry.at(-1)!, START)).toBeLessThan(1);
      expect(r.stopAtM!).toBeGreaterThan(r.distanceM * 0.6);
      expect(r.description).toContain("afsluiter");
    }
  });
  it("NO_STOP when nothing is close to the start", async () => {
    const err = await generateRoutes({ ...base, category: "coffee", stopMode: "finish" }, { router: fakeRouter, findPois: async () => [poi("f", "Ver", destination(START, 0, 4000))] }).catch((e) => e);
    expect(err.code).toBe("NO_STOP");
  });
});

describe("custom distance", () => {
  it("handles non-standard distances like 12.5 km", async () => {
    const { routes } = await generateRoutes({ ...base, distanceKm: 12.5 }, { router: fakeRouter, findPois: async () => [] });
    expect(Math.abs(routes[0].deviation)).toBeLessThanOrEqual(0.05);
  });
});

describe("stop ranking", () => {
  it("sponsored status never changes ranking", () => {
    const list = [
      poi("a", "A", destination(START, 10, 1500)),
      poi("b", "B", destination(START, 100, 1100)),
      poi("c", "C", destination(START, 200, 2000)),
    ];
    const plain = rankStops(list, START, 10000, "midway", 5, 3).map((p) => p.id);
    const sponsored = rankStops(
      list.map((p) => (p.id === "c" ? { ...p, sponsored: true, source: "partner" as const } : p)),
      START, 10000, "midway", 5, 3,
    ).map((p) => p.id);
    expect(sponsored).toEqual(plain);
  });
  it("excludes stops that are too far or too close", () => {
    const list = [poi("near", "N", destination(START, 0, 100)), poi("far", "F", destination(START, 0, 9000))];
    expect(rankStops(list, START, 10000, "midway", 1)).toEqual([]);
  });
  it("solveParam returns null when even the smallest shape is too long", () => {
    const shape = { pMin: 100, pMax: 1000, build: (p: number) => [{ ...START, kind: "break" as const }, { ...destination(START, 0, p + 5000), kind: "break" as const }] };
    expect(solveParam(shape, 1000)).toBeNull();
  });
});

describe("input handling", () => {
  it("parseElements never invents or keeps unnamed places", () => {
    const out = parseElements(
      [
        { type: "node", id: 1, lat: 1, lon: 2, tags: { name: "Echt", amenity: "cafe", opening_hours: "Mo-Su 09:00-17:00" } },
        { type: "node", id: 2, lat: 1, lon: 2, tags: { amenity: "cafe" } },
        { type: "way", id: 3, tags: { name: "Zonder plek" } },
        { type: "way", id: 4, center: { lat: 3, lon: 4 }, tags: { name: "Park", leisure: "park" } },
      ],
      "coffee",
    );
    expect(out.map((p) => p.name)).toEqual(["Echt", "Park"]);
    expect(out[0].openingHours).toBe("Mo-Su 09:00-17:00");
    expect(out[1].openingHours).toBeUndefined();
  });
  it("supermarkets: only the well-known chains", () => {
    const el = (id: number, tags: Record<string, string>) => ({ type: "node" as const, id, lat: 52, lon: 5, tags: { shop: "supermarket", ...tags } });
    const out = parseElements(
      [
        el(1, { name: "Jumbo" }),
        el(2, { name: "Albert Heijn" }),
        el(3, { name: "Dirk" }),
        el(4, { name: "Lidl" }),
        el(5, { name: "SPAR City" }),
        el(6, { name: "Aldi" }),
        el(7, { name: "Buurtsuper Mohammed" }),
        el(8, { name: "Dekamarkt" }),
        el(9, { name: "Plus Verhoeven", brand: "Plus" }),
        el(10, { name: "Winkel", brand: "Jumbo" }),
      ],
      "supermarket",
    );
    expect(out.map((p) => p.id)).toEqual(["osm:node/1", "osm:node/2", "osm:node/3", "osm:node/4", "osm:node/6", "osm:node/10"]);
  });
  it("other categories are not chain-filtered", () => {
    const out = parseElements([{ type: "node", id: 1, lat: 1, lon: 2, tags: { name: "Eigen Koffietent", amenity: "cafe" } }], "coffee");
    expect(out).toHaveLength(1);
  });
  it("parseRequest validates", () => {
    expect(typeof parseRequest({})).toBe("string");
    expect(typeof parseRequest({ start: { lat: 1, lng: 1 }, distanceKm: 500 })).toBe("string");
    expect(typeof parseRequest({ start: { lat: 1, lng: 1 }, distanceKm: 5, category: "pizza" })).toBe("string");
    const ok = parseRequest({ start: { lat: 52, lng: 5 }, distanceKm: 7.5, category: "coffee" });
    expect(typeof ok).toBe("object");
  });
});

describe("rankStops supermarkets", () => {
  it("picks the supermarket nearest to home when it is the finish", () => {
    const mk = (id: string, dLat: number) => ({
      id, name: id, category: "supermarket" as const, kind: "Supermarkt",
      location: { lat: START.lat + dLat, lng: START.lng }, source: "osm" as const, sponsored: false, offers: [],
    });
    const list = [mk("far", 0.03), mk("near", 0.004), mk("mid", 0.015)];
    expect(rankStops(list, START, 10000, "finish", 3, 3).map((p) => p.id)).toEqual(["near"]);
  });
});

import { isKnownChain } from "@/lib/overpass";

describe("supermarket chains", () => {
  it("accepts big stores and rejects small formats", () => {
    expect(isKnownChain({ name: "Albert Heijn" })).toBe(true);
    expect(isKnownChain({ name: "Jumbo", brand: "Jumbo" })).toBe(true);
    expect(isKnownChain({ name: "Jumbo City" })).toBe(false);
    expect(isKnownChain({ name: "Spar University" })).toBe(false);
    expect(isKnownChain({ name: "AH to go", brand: "Albert Heijn" })).toBe(false);
    expect(isKnownChain({ name: "Albert Heijn to go" })).toBe(false);
  });
});
