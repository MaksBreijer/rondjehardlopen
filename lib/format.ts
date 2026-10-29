export const km = (m: number, digits = 1) => `${(m / 1000).toFixed(digits).replace(".", ",")} km`;

export function duration(s: number): string {
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return `${h} u ${r.toString().padStart(2, "0")} min`;
}

export const kmLabel = (k: number) => String(k).replace(".", ",");

export const pct = (x: number) => `${Math.round(x * 100)}%`;
