import { describe, expect, it } from "vitest";
import { snapToPath, bearing, decodePolyline, destination, haversine, minDistanceToPath, pairOverlap, selfOverlap, simplify } from "@/lib/geo";
import { START } from "./helpers";

describe("geo", () => {
  it("haversine: 1 degree latitude is about 111 km", () => {
    expect(haversine({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeGreaterThan(111000);
    expect(haversine({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeLessThan(111400);
  });
  it("destination goes the requested distance and bearing", () => {
    const p = destination(START, 90, 2000);
    expect(haversine(START, p)).toBeCloseTo(2000, 0);
    expect(bearing(START, p)).toBeCloseTo(90, 0);
  });
  it("decodes a precision-6 polyline", () => {
    // encoded (0,0) -> (0.00001, 0.00002)
    expect(decodePolyline("??", 6)).toEqual([{ lat: 0, lng: 0 }]);
    const pts = decodePolyline("_ibE_seK_seK_seK", 6);
    expect(pts).toHaveLength(2);
    expect(pts[0].lat).toBeCloseTo(0.1, 5);
  });
  it("simplify drops collinear points but keeps ends", () => {
    const line = [0, 1, 2, 3, 4].map((i) => ({ lat: 52 + i * 0.001, lng: 5 }));
    const s = simplify(line, 3);
    expect(s).toHaveLength(2);
    expect(s[0]).toEqual(line[0]);
  });
  it("minDistanceToPath measures to the segment, not just vertices", () => {
    const path = [START, destination(START, 90, 1000)];
    const p = destination(destination(START, 90, 500), 0, 30);
    expect(minDistanceToPath(p, path)).toBeCloseTo(30, 0);
  });
  it("selfOverlap flags out-and-back, not a clean loop", () => {
    const a = destination(START, 90, 2000);
    const outBack = [START, a, START];
    const loop = [START, destination(START, 90, 1500), destination(START, 0, 1500), destination(START, 270, 1500), START];
    expect(selfOverlap(outBack)).toBeGreaterThan(0.35);
    expect(selfOverlap(loop)).toBeLessThan(0.05);
  });
  it("pairOverlap is high for identical and low for different routes", () => {
    const a = [START, destination(START, 90, 2000)];
    const b = [START, destination(START, 0, 2000)];
    expect(pairOverlap(a, a)).toBeGreaterThan(0.95);
    expect(pairOverlap(a, b)).toBeLessThan(0.1);
  });
  it("snapToPath gives progress along the path and distance off it", () => {
    const end = destination(START, 90, 1000);
    const p = destination(destination(START, 90, 400), 0, 60);
    const r = snapToPath(p, [START, end]);
    expect(r.alongM).toBeCloseTo(400, -1);
    expect(r.offM).toBeCloseTo(60, 0);
  });
});
