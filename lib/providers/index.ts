import { FallbackRouter } from "./fallback";
import { OrsRouter } from "./ors";
import { OsrmFootRouter } from "./osrm";
import type { Router } from "./types";
import { ValhallaRouter } from "./valhalla";

/** ROUTING_PROVIDER=ors|valhalla|osrm. Default: ors when ORS_API_KEY is set, else keyless Valhalla. */
let cached: { key: string; router: Router } | null = null;

export function getRouter(): Router {
  const key = [process.env.ROUTING_PROVIDER, process.env.ORS_API_KEY, process.env.ORS_URL].join("|");
  if (cached?.key !== key) cached = { key, router: create() };
  return cached.router;
}

function create(): Router {
  const choice = (process.env.ROUTING_PROVIDER || "").toLowerCase();
  if (choice === "ors") {
    if (!process.env.ORS_API_KEY && !process.env.ORS_URL) throw new Error("ROUTING_PROVIDER=ors vereist ORS_API_KEY");
    return new OrsRouter();
  }
  if (choice === "valhalla") return new ValhallaRouter();
  if (choice === "osrm") return new OsrmFootRouter();
  // Default: the primary router with automatic failover to keyless OSRM-foot when it is unreachable.
  return new FallbackRouter(process.env.ORS_API_KEY ? new OrsRouter() : new ValhallaRouter(), new OsrmFootRouter());
}
