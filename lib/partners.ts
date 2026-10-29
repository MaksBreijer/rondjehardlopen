import fs from "node:fs";
import path from "node:path";
import { haversine } from "./geo";
import type { Business, Category, LatLng, Offer, Poi } from "./types";

/**
 * Partner store. v1 reads data/partners.json (empty by default); swap this for a database later.
 * Rule: partner status may add a place to the candidate pool and show a "Gesponsord" label,
 * but never changes how candidates are ranked or how the route is computed.
 */
export interface PartnerStore {
  all(): Business[];
}

export class JsonPartnerStore implements PartnerStore {
  constructor(private file = path.join(process.cwd(), "data", "partners.json")) {}
  all(): Business[] {
    try {
      return JSON.parse(fs.readFileSync(this.file, "utf8")) as Business[];
    } catch {
      return [];
    }
  }
}

const activeOn = (from: string, until: string, today: string) => from <= today && today <= until;

export function activeOffers(b: Business, now = new Date()): Offer[] {
  const today = now.toISOString().slice(0, 10);
  return b.offers.filter((o) => activeOn(o.validFrom, o.validUntil, today));
}

export function partnerPois(
  category: Category,
  center: LatLng,
  radiusM: number,
  store: PartnerStore = new JsonPartnerStore(),
  now = new Date(),
): Poi[] {
  const today = now.toISOString().slice(0, 10);
  return store
    .all()
    .filter((b) => (category === "surprise" || b.category === category) && haversine(center, b.location) <= radiusM)
    .map((b) => ({
      id: `partner:${b.id}`,
      name: b.name,
      category: b.category,
      kind: "Lokale partner",
      location: b.location,
      address: b.address,
      openingHours: b.openingHours,
      website: b.website,
      source: "partner" as const,
      sponsored: !!b.promotion && activeOn(b.promotion.validFrom, b.promotion.validUntil, today),
      offers: activeOffers(b, now),
    }));
}
