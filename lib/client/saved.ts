import type { RouteResult } from "../types";

const KEY = "rh.saved.v1";

export interface SavedRoute {
  savedAt: string;
  route: RouteResult;
}

export function loadSaved(): SavedRoute[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedRoute[]) : [];
  } catch {
    return [];
  }
}

export function saveRoute(route: RouteResult): SavedRoute[] {
  const list = loadSaved().filter((s) => s.route.id !== route.id);
  list.unshift({ savedAt: new Date().toISOString(), route });
  return persist(list.slice(0, 20));
}

export function removeSaved(id: string): SavedRoute[] {
  return persist(loadSaved().filter((s) => s.route.id !== id));
}

function persist(list: SavedRoute[]): SavedRoute[] {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked: keep UI working */
  }
  return list;
}
