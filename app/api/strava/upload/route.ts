import { NextResponse } from "next/server";
import { accessToken, uploadGpx, uploadStatus } from "@/lib/strava";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const token = await accessToken();
  if (!token) return NextResponse.json({ error: "Niet verbonden met Strava" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { gpx?: string; name?: string } | null;
  if (!b?.gpx || typeof b.gpx !== "string" || b.gpx.length > 5_000_000 || !b.gpx.includes("<trkpt")) {
    return NextResponse.json({ error: "Ongeldige activiteit" }, { status: 400 });
  }
  const r = await uploadGpx(token, b.gpx, String(b.name ?? "Hardlooprondje").slice(0, 100));
  if (!r.ok) return NextResponse.json({ error: r.body.error || `Strava weigerde de upload (${r.status})` }, { status: 502 });
  return NextResponse.json({ id: r.body.id });
}

export async function GET(req: Request) {
  const token = await accessToken();
  if (!token) return NextResponse.json({ error: "Niet verbonden met Strava" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !/^\d+$/.test(id)) return NextResponse.json({ error: "Ongeldig id" }, { status: 400 });
  const s = await uploadStatus(token, id);
  return NextResponse.json({ status: s.status, error: s.error, activityId: s.activity_id ?? null });
}
