import { NextResponse } from "next/server";
import { reverse, search } from "@/lib/geocode";
import { allow } from "@/lib/ratelimit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allow(`geo:${ip}`, 20, 60_000)) return NextResponse.json({ error: "Te veel aanvragen" }, { status: 429 });
  const u = new URL(req.url);
  const q = u.searchParams.get("q")?.trim();
  const lat = Number(u.searchParams.get("lat"));
  const lng = Number(u.searchParams.get("lng"));
  try {
    if (q) {
      if (q.length < 3 || q.length > 200) return NextResponse.json({ error: "Voer minstens 3 tekens in" }, { status: 400 });
      return NextResponse.json({ places: await search(q) });
    }
    if (u.searchParams.has("lat") && Number.isFinite(lat) && Number.isFinite(lng)) {
      return NextResponse.json({ label: await reverse({ lat, lng }) });
    }
    return NextResponse.json({ error: "Geef q of lat/lng mee" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Adreszoeker is nu niet bereikbaar" }, { status: 502 });
  }
}
