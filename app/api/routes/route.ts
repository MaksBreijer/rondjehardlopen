import { NextResponse } from "next/server";
import { GenerateError, generateRoutes } from "@/lib/generator";
import { findPois } from "@/lib/overpass";
import { getRouter } from "@/lib/providers";
import { allow } from "@/lib/ratelimit";
import { parseRequest } from "@/lib/validate";
import type { ApiError } from "@/lib/types";

const cache = new Map<string, { at: number; body: unknown }>();

export const runtime = "nodejs";
export const maxDuration = 60;

const err = (status: number, code: ApiError["error"]["code"], message: string, alternatives?: ApiError["error"]["alternatives"]) =>
  NextResponse.json({ error: { code, message, alternatives } } satisfies ApiError, { status });

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allow(`routes:${ip}`, 12, 60_000)) return err(429, "RATE_LIMITED", "Even rustig aan: te veel aanvragen. Probeer het over een minuut opnieuw.");
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err(400, "BAD_REQUEST", "Ongeldige JSON");
  }
  const parsed = parseRequest(body);
  if (typeof parsed === "string") return err(400, "BAD_REQUEST", parsed);
  let router;
  try {
    router = getRouter();
  } catch (e) {
    return err(500, "NOT_CONFIGURED", e instanceof Error ? e.message : "Routing niet geconfigureerd");
  }
  try {
    const key = JSON.stringify(parsed);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 10 * 60_000) return NextResponse.json(hit.body);
    const own = !!(process.env.ORS_API_KEY || process.env.ORS_URL || process.env.VALHALLA_URL);
    const out = await generateRoutes(parsed, { router, findPois, effort: own ? "high" : "normal" });
    const body = { ...out, provider: router.name };
    cache.set(key, { at: Date.now(), body });
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
    return NextResponse.json(body);
  } catch (e) {
    if (e instanceof GenerateError) {
      const status = e.code === "NO_STOP" ? 404 : e.code === "RATE_LIMITED" ? 429 : 502;
      return err(status, e.code, e.message, e.alternatives);
    }
    return err(500, "ROUTING_FAILED", e instanceof Error ? e.message : "Onbekende fout");
  }
}
