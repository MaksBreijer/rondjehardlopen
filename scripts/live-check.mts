// Live smoke test against the real providers: npx tsx scripts/live-check.mts [category] [km] [lat] [lng]
import { generateRoutes } from "../lib/generator";
import { findPois } from "../lib/overpass";
import { getRouter } from "../lib/providers";
import type { Category } from "../lib/types";

const [cat, km, lat, lng] = process.argv.slice(2);
const category = (cat && cat !== "none" ? cat : null) as Category | null;
const router = getRouter();
const t = Date.now();
try {
  const out = await generateRoutes(
    {
      start: { lat: +(lat ?? 52.3676), lng: +(lng ?? 4.9041) },
      distanceKm: +(km ?? 10),
      category,
      stopMode: "midway",
      visit: "visit",
      prefs: { green: true, quiet: false },
      seed: 1,
    },
    { router, findPois },
  );
  console.log(router.name, Date.now() - t, "ms", out.warnings);
  for (const r of out.routes)
    console.log(r.title, "|", r.badge, "|", (r.distanceM / 1000).toFixed(2), "km", (r.deviation * 100).toFixed(1) + "%", "|", r.stop?.name ?? "-", "|", r.features.join("; "), "|", r.geometry.length, "pts");
} catch (e: any) {
  console.log("ERR", e.code, e.message, JSON.stringify(e.alternatives?.map((a: any) => [a.poi.name, a.crowDistanceM, a.minDistanceKm])));
}
