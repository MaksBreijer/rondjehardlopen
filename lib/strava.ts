import { cookies } from "next/headers";

const API = "https://www.strava.com";

export const stravaConfigured = () => !!(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET);

export const redirectUri = (origin: string) => process.env.STRAVA_REDIRECT_URI || `${origin}/api/strava/callback`;

interface Tokens {
  a: string; // access token
  r: string; // refresh token
  e: number; // expires at (epoch seconds)
}

async function tokenRequest(params: Record<string, string>): Promise<Tokens> {
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.STRAVA_CLIENT_ID!, client_secret: process.env.STRAVA_CLIENT_SECRET!, ...params }),
  });
  if (!res.ok) throw new Error(`Strava token fout (${res.status})`);
  const j = (await res.json()) as { access_token: string; refresh_token: string; expires_at: number };
  return { a: j.access_token, r: j.refresh_token, e: j.expires_at };
}

export const exchangeCode = (code: string) => tokenRequest({ code, grant_type: "authorization_code" });

export async function saveTokens(t: Tokens) {
  (await cookies()).set("rh_strava", JSON.stringify(t), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
}

/** Returns a valid access token (refreshing when needed) or null when not connected. */
export async function accessToken(): Promise<string | null> {
  const raw = (await cookies()).get("rh_strava")?.value;
  if (!raw) return null;
  let t: Tokens;
  try {
    t = JSON.parse(raw);
  } catch {
    return null;
  }
  if (t.e - 60 > Date.now() / 1000) return t.a;
  try {
    t = await tokenRequest({ refresh_token: t.r, grant_type: "refresh_token" });
    await saveTokens(t);
    return t.a;
  } catch {
    return null;
  }
}

export async function uploadGpx(token: string, gpx: string, name: string) {
  const form = new FormData();
  form.set("file", new Blob([gpx], { type: "application/gpx+xml" }), "rondje.gpx");
  form.set("data_type", "gpx");
  form.set("name", name);
  form.set("sport_type", "Run");
  form.set("description", "Gemaakt met RondjeHardlopen.nl");
  const res = await fetch(`${API}/api/v3/uploads`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: j as { id?: number; error?: string; status?: string; activity_id?: number | null } };
}

export async function uploadStatus(token: string, id: string) {
  const res = await fetch(`${API}/api/v3/uploads/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } });
  return (await res.json().catch(() => ({}))) as { error?: string; status?: string; activity_id?: number | null };
}
