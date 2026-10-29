import { describe, expect, it } from "vitest";
import { buildGpx, buildRecordedGpx } from "@/lib/gpx";
import { poi, START } from "./helpers";
import type { RouteResult } from "@/lib/types";

const route: RouteResult = {
  id: "r",
  title: "De koffiepauze & meer - 10 km",
  badge: "",
  description: "",
  distanceM: 10000,
  durationS: 3600,
  deviation: 0,
  geometry: [START, { lat: 52.1, lng: 5.13 }, START],
  start: START,
  stop: poi("1", 'Café "De <Hoek>"', { lat: 52.1, lng: 5.13 }),
  features: [],
  selfOverlap: 0,
};

describe("gpx", () => {
  const gpx = buildGpx(route, { time: new Date("2026-01-01T00:00:00Z") });
  it("is well-formed with one track point per vertex", () => {
    expect(gpx.startsWith('<?xml version="1.0"')).toBe(true);
    expect(gpx.match(/<trkpt /g)).toHaveLength(3);
    expect(gpx).toContain('lat="52.090000" lon="5.120000"');
    expect(gpx.trim().endsWith("</gpx>")).toBe(true);
  });
  it("has waypoints for start and stop and escapes XML", () => {
    expect(gpx.match(/<wpt /g)).toHaveLength(2);
    expect(gpx).toContain("Café &quot;De &lt;Hoek&gt;&quot;");
    expect(gpx).toContain("De koffiepauze &amp; meer");
    expect(gpx).not.toContain("<Hoek>");
  });
  it("omits the stop waypoint when there is no stop", () => {
    expect(buildGpx({ ...route, stop: undefined }).match(/<wpt /g)).toHaveLength(1);
  });
});

describe("recorded gpx", () => {
  it("has a timestamp on every track point (needed by Strava/Garmin)", () => {
    const x = buildRecordedGpx("Run <1>", [
      { lat: 52.09, lng: 5.12, t: Date.UTC(2026, 0, 1, 8, 0, 0) },
      { lat: 52.091, lng: 5.121, t: Date.UTC(2026, 0, 1, 8, 0, 5) },
    ]);
    expect(x.match(/<trkpt /g)).toHaveLength(2);
    expect(x.match(/<time>/g)).toHaveLength(3);
    expect(x).toContain("2026-01-01T08:00:05.000Z");
    expect(x).toContain("<type>running</type>");
    expect(x).toContain("Run &lt;1&gt;");
  });
});
