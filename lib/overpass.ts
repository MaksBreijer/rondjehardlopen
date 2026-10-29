import { haversine } from "./geo";
import { fetchJson } from "./providers/http";
import { partnerPois } from "./partners";
import type { Category, LatLng, Poi } from "./types";

const ENDPOINTS = (
  process.env.OVERPASS_URLS ||
  "https://overpass.openstreetmap.fr/api/interpreter,https://overpass-api.de/api/interpreter,https://overpass.private.coffee/api/interpreter"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const FILTERS: Record<Category, string[]> = {
  coffee: ['["amenity"="cafe"]', '["shop"="coffee"]'],
  bakery: ['["shop"="bakery"]', '["shop"="pastry"]'],
  supermarket: ['["shop"="supermarket"]'],
  green: ['["leisure"="park"]', '["leisure"="nature_reserve"]', '["landuse"="forest"]', '["natural"="wood"]'],
  surprise: [
    '["tourism"="viewpoint"]',
    '["tourism"="attraction"]',
    '["historic"~"^(windmill|castle|monument|memorial|ruins|fort)$"]',
    '["man_made"~"^(windmill|lighthouse|tower)$"]',
  ],
};

const KIND: Record<string, string> = {
  cafe: "Café",
  coffee: "Koffiewinkel",
  bakery: "Bakkerij",
  pastry: "Banketbakker",
  supermarket: "Supermarkt",
  park: "Park",
  nature_reserve: "Natuurgebied",
  forest: "Bos",
  wood: "Bos",
  viewpoint: "Uitzichtpunt",
  attraction: "Bezienswaardigheid",
  windmill: "Molen",
  castle: "Kasteel",
  monument: "Monument",
  memorial: "Gedenkteken",
  ruins: "Ruïne",
  fort: "Fort",
  lighthouse: "Vuurtoren",
  tower: "Toren",
};

type Tags = Record<string, string>;
interface Element {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Tags;
}

function kindOf(tags: Tags): string {
  const key = tags.amenity ?? tags.shop ?? tags.leisure ?? tags.landuse ?? tags.natural ?? tags.tourism ?? tags.historic ?? tags.man_made;
  return (key && KIND[key]) || "Plek";
}

function addressOf(t: Tags): string | undefined {
  const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
  const city = t["addr:city"];
  const s = [street, city].filter(Boolean).join(", ");
  return s || undefined;
}

/** Only the big chains people know and trust for a stop during a run. */
export const SUPERMARKET_CHAINS = /\b(jumbo|albert heijn|dirk|lidl|spar|aldi)\b/i;

/** Small formats are too small for a proper stop: Jumbo City, Spar University/Express, AH to go. */
export const SMALL_FORMATS = /\b(city|university|express|to ?go)\b/i;

export const isKnownChain = (t: Record<string, string>) => {
  const vals = [t.name, t.brand, t.operator].filter((v): v is string => !!v);
  return vals.some((v) => SUPERMARKET_CHAINS.test(v)) && !vals.some((v) => SMALL_FORMATS.test(v));
};

/** Mass-market chains and fast-food style places: not the "nice local spot" people want for a coffee or pastry stop. */
const NOT_SPECIAL: Record<"coffee" | "bakery", RegExp> = {
  coffee: /\b(starbucks|coffee company|douwe egberts|mcdonald|mccafe|burger king|kfc|subway|febo|kwalitaria|new york pizza|snackbar|cafetaria|automaten?)\b/i,
  bakery: /\b(bakker bart|hema|kruidvat|albert heijn|jumbo|lidl|aldi|plus|dirk|spar|ah|snackbar|cafetaria|shoarma)\b/i,
};

const alive = (t: Record<string, string>) => {
  if (t.disused || t.abandoned || t["disused:shop"] || t["disused:amenity"] || t.opening_hours === "off") return false;
  // a place we can verify still exists: opening hours, website, phone or social page in OSM
  return !!(t.opening_hours || t.website || t["contact:website"] || t.phone || t["contact:phone"] || t["contact:instagram"] || t.instagram);
};

/** Quality filter for coffee and bakery stops. OSM has no ratings, so we use signals of an independent, living business. */
export function isGoodSpot(t: Record<string, string>, category: Category): boolean {
  if (category !== "coffee" && category !== "bakery") return true;
  if (!alive(t)) return false;
  const vals = [t.name, t.brand, t.operator].filter((v): v is string => !!v);
  if (vals.some((v) => NOT_SPECIAL[category].test(v))) return false;
  if (category === "coffee") return t.amenity === "cafe" || t.shop === "coffee";
  return t.shop === "bakery" || t.shop === "pastry";
}

export function parseElements(elements: Element[], category: Category): Poi[] {
  const out: Poi[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    // never invent places: unnamed or locationless elements are skipped
    if (!tags.name || lat === undefined || lng === undefined) continue;
    if (category === "supermarket" && !isKnownChain(tags)) continue;
    if (!isGoodSpot(tags, category)) continue;
    out.push({
      id: `osm:${el.type}/${el.id}`,
      name: tags.name,
      category,
      kind: kindOf(tags),
      location: { lat, lng },
      address: addressOf(tags),
      openingHours: tags.opening_hours,
      website: tags.website ?? tags["contact:website"],
      source: "osm",
      sponsored: false,
      offers: [],
      osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    });
  }
  return out;
}

const cache = new Map<string, { at: number; pois: Poi[] }>();
const TTL = 10 * 60 * 1000;

async function queryOverpass(query: string): Promise<Element[]> {
  let last: unknown;
  for (const url of ENDPOINTS) {
    try {
      const json = (await fetchJson(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "RondjeHardlopen/0.1", Accept: "*/*" },
          body: "data=" + encodeURIComponent(query),
        },
        20000,
        0,
      )) as { elements?: Element[] };
      return json.elements ?? [];
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("Overpass niet bereikbaar");
}

/** Named places of a category around a point, nearest first. Combines OSM with partner businesses. */
export async function findPois(category: Category, center: LatLng, radiusM: number): Promise<Poi[]> {
  const key = `${category}:${center.lat.toFixed(3)}:${center.lng.toFixed(3)}:${Math.round(radiusM / 100)}`;
  const hit = cache.get(key);
  let osm: Poi[];
  if (hit && Date.now() - hit.at < TTL) osm = hit.pois;
  else {
    // bbox queries are far faster than `around` on the public instances
    const dLat = radiusM / 110540;
    const dLng = radiusM / (111320 * Math.cos((center.lat * Math.PI) / 180));
    const bbox = `${center.lat - dLat},${center.lng - dLng},${center.lat + dLat},${center.lng + dLng}`;
    const types = category === "green" ? ["node", "way", "relation"] : ["node", "way"];
    const body = FILTERS[category].flatMap((f) => types.map((t) => `${t}${f}["name"];`)).join("");
    const query = `[out:json][timeout:25][bbox:${bbox}];(${body});out center tags 400;`;
    osm = parseElements(await queryOverpass(query), category).filter((p) => haversine(center, p.location) <= radiusM);
    cache.set(key, { at: Date.now(), pois: osm });
  }
  const partners = partnerPois(category, center, radiusM);
  const partnerNames = new Set(partners.map((p) => p.name.toLowerCase()));
  return [...partners, ...osm.filter((p) => !partnerNames.has(p.name.toLowerCase()))].sort(
    (a, b) => haversine(center, a.location) - haversine(center, b.location),
  );
}
