import { NextResponse } from "next/server";
import { exchangeCode, saveTokens, stravaConfigured } from "@/lib/strava";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const back = (s: string) => NextResponse.redirect(`${u.origin}/?strava=${s}`);
  if (!stravaConfigured()) return back("not_configured");
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  const expected = req.headers.get("cookie")?.match(/rh_strava_state=([a-f0-9]+)/)?.[1];
  if (u.searchParams.get("error") || !code) return back("denied");
  if (!state || state !== expected) return back("error");
  try {
    await saveTokens(await exchangeCode(code));
    return back("connected");
  } catch {
    return back("error");
  }
}
