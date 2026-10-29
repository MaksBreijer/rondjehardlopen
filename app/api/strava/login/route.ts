import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { redirectUri, stravaConfigured } from "@/lib/strava";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  if (!stravaConfigured()) return NextResponse.redirect(`${origin}/?strava=not_configured`);
  const state = randomBytes(16).toString("hex");
  const url = new URL("https://www.strava.com/oauth/authorize");
  url.searchParams.set("client_id", process.env.STRAVA_CLIENT_ID!);
  url.searchParams.set("redirect_uri", redirectUri(origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", "activity:write");
  url.searchParams.set("state", state);
  const res = NextResponse.redirect(url);
  res.cookies.set("rh_strava_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
