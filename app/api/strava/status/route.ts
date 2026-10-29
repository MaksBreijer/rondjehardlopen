import { NextResponse } from "next/server";
import { accessToken, stravaConfigured } from "@/lib/strava";

export const runtime = "nodejs";

export async function GET() {
  const configured = stravaConfigured();
  return NextResponse.json({ configured, connected: configured ? !!(await accessToken()) : false });
}
