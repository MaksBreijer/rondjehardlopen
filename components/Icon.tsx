import { renderToStaticMarkup } from "react-dom/server";
import {
  ArrowRight,
  CaretLeft,
  Check,
  Pause,
  Play,
  Stop,
  X,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";

/**
 * Content icons are Apple-style emoji (rendered by the device's own emoji font, so they look native on iPhone/Mac).
 * Pure UI controls (close, back, arrows, transport) stay as Phosphor line icons (MIT, phosphoricons.com).
 */
type Entry = { C: PhosphorIcon; weight?: "light" | "regular" | "fill" | "duotone" } | { e: string };

const MAP: Record<string, Entry> = {
  coffee: { e: "☕" },
  croissant: { e: "🥐" },
  cart: { e: "🛒" },
  pine: { e: "🌳" },
  leaf: { e: "🌿" },
  spark: { e: "🎁" },
  home: { e: "🏠" },
  moon: { e: "🤫" },
  clock: { e: "⏱️" },
  watch: { e: "⌚" },
  share: { e: "📤" },
  bookmark: { e: "🔖" },
  bookmarkFill: { e: "🔖" },
  download: { e: "💾" },
  refresh: { e: "🔄" },
  pin: { e: "📍" },
  flag: { e: "🏁" },
  link: { e: "🔗" },
  play: { C: Play, weight: "fill" },
  pause: { C: Pause, weight: "fill" },
  stop: { C: Stop, weight: "fill" },
  close: { C: X },
  back: { C: CaretLeft },
  check: { C: Check },
  arrow: { C: ArrowRight },
};

export type IconName = keyof typeof MAP | "loop" | "ring";

function Loop({ size, className }: { size?: number | string; className?: string }) {
  return (
    <svg className={className} width={size ?? "1em"} height={size ?? "1em"} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.2 9.2A8 8 0 1 0 19.2 14.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="19.8" cy="12" r="1.9" fill="currentColor" />
    </svg>
  );
}

export default function Icon({ name, size = "1.2em", className = "" }: { name: IconName; size?: number | string; className?: string }) {
  if (name === "loop" || name === "ring") return <Loop size={size} className={`ico ${className}`} />;
  const entry = MAP[name];
  if ("e" in entry) return <span className={`emo ${className}`} style={typeof size === "number" ? { fontSize: size } : undefined} aria-hidden="true">{entry.e}</span>;
  const { C, weight } = entry;
  return <C className={`ico ${className}`} size={size} weight={weight ?? "light"} aria-hidden="true" />;
}

/** Static SVG markup, for Leaflet markers. */
export function iconSvg(name: IconName, size = 18): string {
  return renderToStaticMarkup(<Icon name={name} size={size} />);
}
