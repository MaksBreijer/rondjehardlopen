import type { LatLng } from "./types";

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function haversine(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearing(a: LatLng, b: LatLng): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function destination(p: LatLng, bearingDeg: number, distM: number): LatLng {
  const br = rad(bearingDeg);
  const dr = distM / R;
  const lat1 = rad(p.lat);
  const lng1 = rad(p.lng);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dr) + Math.cos(lat1) * Math.sin(dr) * Math.cos(br));
  const lng2 =
    lng1 + Math.atan2(Math.sin(br) * Math.sin(dr) * Math.cos(lat1), Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: deg(lat2), lng: ((deg(lng2) + 540) % 360) - 180 };
}

export const midpoint = (a: LatLng, b: LatLng): LatLng => destination(a, bearing(a, b), haversine(a, b) / 2);

export function pathLength(pts: LatLng[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += haversine(pts[i - 1], pts[i]);
  return s;
}

/** Decode a Google/Valhalla encoded polyline. Valhalla uses precision 6. */
export function decodePolyline(str: string, precision = 6): LatLng[] {
  const factor = 10 ** precision;
  const out: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < str.length) {
    for (const axis of [0, 1]) {
      let result = 0;
      let shift = 0;
      let b: number;
      do {
        b = str.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    out.push({ lat: lat / factor, lng: lng / factor });
  }
  return out;
}

/** Local equirectangular projection to metres around a reference latitude. */
function project(p: LatLng, ref: LatLng) {
  return { x: (p.lng - ref.lng) * Math.cos(rad(ref.lat)) * 111320, y: (p.lat - ref.lat) * 110540 };
}

function distToSegment(p: LatLng, a: LatLng, b: LatLng): number {
  const pa = project(a, p);
  const pb = project(b, p);
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (-pa.x * dx + -pa.y * dy) / len2));
  return Math.hypot(pa.x + t * dx, pa.y + t * dy);
}

export function minDistanceToPath(p: LatLng, path: LatLng[]): number {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) best = Math.min(best, distToSegment(p, path[i - 1], path[i]));
  return best;
}

/** Distance along the path from its start to the vertex closest to p. */
export function alongPathTo(p: LatLng, path: LatLng[]): number {
  let best = Infinity;
  let at = 0;
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const seg = haversine(path[i - 1], path[i]);
    const d = distToSegment(p, path[i - 1], path[i]);
    if (d < best) {
      best = d;
      at = acc + seg / 2;
    }
    acc += seg;
  }
  return at;
}

/** Douglas-Peucker with tolerance in metres. */
export function simplify(pts: LatLng[], tolM: number): LatLng[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = distToSegment(pts[i], pts[s], pts[e]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > tolM) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

export function sampleEvenly<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  return Array.from({ length: n }, (_, i) => arr[Math.round((i * (arr.length - 1)) / (n - 1))]);
}

const CELL = 30;

/** Walk a path and emit a sample about every `step` metres. */
function densify(path: LatLng[], step = 10): LatLng[] {
  const out: LatLng[] = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const n = Math.max(1, Math.round(haversine(a, b) / step));
    for (let k = 0; k < n; k++) out.push({ lat: a.lat + ((b.lat - a.lat) * k) / n, lng: a.lng + ((b.lng - a.lng) * k) / n });
  }
  if (path.length) out.push(path[path.length - 1]);
  return out;
}

const cellKey = (p: LatLng, ref: LatLng) => {
  const { x, y } = project(p, ref);
  return `${Math.round(x / CELL)}:${Math.round(y / CELL)}`;
};

/**
 * Share (0..1) of the route that runs over cells it already visited earlier
 * (out-and-back stretches). The first and last 150 m are ignored so a loop
 * closing on its start is not counted.
 */
export function selfOverlap(path: LatLng[]): number {
  if (path.length < 2) return 0;
  const pts = densify(path);
  const ref = pts[0];
  const margin = 15;
  const window = 40; // samples (~400 m) before a revisit counts as a different pass
  const seen = new Map<string, number>();
  let repeated = 0;
  let counted = 0;
  pts.forEach((p, i) => {
    const k = cellKey(p, ref);
    const first = seen.get(k);
    const inBody = i >= margin && i < pts.length - margin;
    if (inBody) {
      counted++;
      if (first !== undefined && i - first > window) repeated++;
    }
    if (first === undefined) seen.set(k, i);
  });
  return counted ? repeated / counted : 0;
}

/** Share (0..1) of path a that follows the same cells as path b. */
export function pairOverlap(a: LatLng[], b: LatLng[]): number {
  if (!a.length || !b.length) return 0;
  const A = densify(a);
  const B = densify(b);
  const ref = A[0];
  const cells = new Set(B.map((p) => cellKey(p, ref)));
  const margin = 15;
  let hit = 0;
  let n = 0;
  for (let i = margin; i < A.length - margin; i++) {
    n++;
    if (cells.has(cellKey(A[i], ref))) hit++;
  }
  return n ? hit / n : 0;
}

/** Project p on the path: distance along the path to the closest point, and how far p is from the path. */
export function snapToPath(p: LatLng, path: LatLng[]): { alongM: number; offM: number } {
  let best = Infinity;
  let along = 0;
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const seg = haversine(a, b);
    const pa = project(a, p);
    const pb = project(b, p);
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (-pa.x * dx + -pa.y * dy) / len2));
    const d = Math.hypot(pa.x + t * dx, pa.y + t * dy);
    if (d < best) {
      best = d;
      along = acc + seg * t;
    }
    acc += seg;
  }
  return { alongM: along, offM: best };
}
