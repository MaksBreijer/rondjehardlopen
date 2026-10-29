import { RoutingError } from "./types";

/** fetch with timeout, one retry on 429/5xx/network errors. */
export async function fetchJson(url: string, init: RequestInit, timeoutMs = 15000, retries = 1): Promise<unknown> {
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctl.signal, cache: "no-store" });
      if (res.ok) return await res.json();
      const body = await res.text().catch(() => "");
      const retriable = res.status === 429 || res.status >= 500;
      last = new RoutingError(`HTTP ${res.status}: ${body.slice(0, 200)}`, res.status, retriable);
      if (!retriable) throw last;
    } catch (e) {
      if (e instanceof RoutingError && !e.retriable) throw e;
      last = e instanceof RoutingError ? e : new RoutingError(e instanceof Error ? e.message : "netwerkfout", undefined, true);
    } finally {
      clearTimeout(t);
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
  }
  throw last;
}
