import type { RouteResult } from "./types";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function buildGpx(route: RouteResult, opts: { time?: Date } = {}): string {
  const time = (opts.time ?? new Date()).toISOString();
  const pt = (p: { lat: number; lng: number }) => `lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}"`;
  const wpts = [
    `<wpt ${pt(route.start)}><name>Start en finish</name></wpt>`,
    ...(route.stop
      ? [`<wpt ${pt(route.stop.location)}><name>${esc(route.stop.name)}</name><desc>${esc(route.stop.kind)}</desc></wpt>`]
      : []),
  ];
  const trkpts = route.geometry.map((p) => `<trkpt ${pt(p)}/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RondjeHardlopen.nl" xmlns="http://www.topografix.com/GPX/1/1">
<metadata><name>${esc(route.title)}</name><desc>${(route.distanceM / 1000).toFixed(2)} km</desc><time>${time}</time></metadata>
${wpts.join("\n")}
<trk><name>${esc(route.title)}</name><trkseg>${trkpts}</trkseg></trk>
</gpx>
`;
}

export interface RecordedPoint {
  lat: number;
  lng: number;
  /** epoch ms */
  t: number;
}

/** GPX of a recorded run (with timestamps, as Strava and Garmin require). */
export function buildRecordedGpx(name: string, points: RecordedPoint[]): string {
  const trkpts = points
    .map((p) => `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}"><time>${new Date(p.t).toISOString()}</time></trkpt>`)
    .join("");
  const start = points.length ? new Date(points[0].t).toISOString() : new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RondjeHardlopen.nl" xmlns="http://www.topografix.com/GPX/1/1">
<metadata><name>${esc(name)}</name><time>${start}</time></metadata>
<trk><name>${esc(name)}</name><type>running</type><trkseg>${trkpts}</trkseg></trk>
</gpx>
`;
}
