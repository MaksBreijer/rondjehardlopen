"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type * as LType from "leaflet";
import { iconSvg } from "./Icon";
import { categoryInfo } from "@/lib/categories";
import type { RouteResult } from "@/lib/types";

const TILES = process.env.NEXT_PUBLIC_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTR = process.env.NEXT_PUBLIC_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

interface Props {
  routes: RouteResult[];
  selectedId: string;
  revealed: Set<string>;
  onSelect: (id: string) => void;
}

export default function RouteMap({ routes, selectedId, revealed, onSelect }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LType.Map | null>(null);
  const layer = useRef<LType.LayerGroup | null>(null);
  const L = useRef<typeof LType | null>(null);
  const lastFit = useRef("");

  useEffect(() => {
    let dead = false;
    import("leaflet").then((mod) => {
      if (dead || !el.current || map.current) return;
      const lf = (mod as any).default ?? mod;
      L.current = lf;
      map.current = lf.map(el.current, { zoomControl: true, attributionControl: true });
      lf.tileLayer(TILES, { attribution: ATTR, maxZoom: 19 }).addTo(map.current!);
      layer.current = lf.layerGroup().addTo(map.current!);
      draw();
    });
    return () => {
      dead = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    const lf = L.current;
    const m = map.current;
    const g = layer.current;
    if (!lf || !m || !g) return;
    g.clearLayers();
    const sel = routes.find((r) => r.id === selectedId) ?? routes[0];
    if (!sel) return;
    const line = (r: RouteResult) => r.geometry.map((p) => [p.lat, p.lng] as [number, number]);
    for (const r of routes) {
      if (r.id === sel.id) continue;
      lf.polyline(line(r), { color: "#ffffff", weight: 4, opacity: 0.28 }).on("click", () => onSelect(r.id)).addTo(g);
    }
    const casing = lf.polyline(line(sel), { color: "#0c1115", weight: 11, opacity: 0.85 }).addTo(g);
    const main = lf.polyline(line(sel), { color: "#ffffff", weight: 5, opacity: 1 }).addTo(g);
    if (lastFit.current !== sel.id && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // the route draws itself on the map
      for (const [poly, delay] of [[casing, 0], [main, 120]] as const) {
        const el = poly.getElement() as SVGPathElement | null;
        if (!el?.getTotalLength) continue;
        const len = el.getTotalLength();
        el.style.strokeDasharray = `${len}`;
        el.style.strokeDashoffset = `${len}`;
        el.getBoundingClientRect();
        el.style.transition = `stroke-dashoffset 1.8s cubic-bezier(.22,1,.36,1) ${delay}ms`;
        el.style.strokeDashoffset = "0";
      }
    }
    lf.marker([sel.start.lat, sel.start.lng], {
      icon: lf.divIcon({ className: "", html: '<div class="pin"><span>S</span></div>', iconSize: [30, 30], iconAnchor: [4, 30] }),
      title: "Start en finish",
    }).addTo(g);
    if (sel.stop) {
      const shown = sel.stop.category !== "surprise" || revealed.has(sel.id);
      const glyph = shown ? iconSvg(categoryInfo(sel.stop.category).icon, 16) : "?";
      lf.marker([sel.stop.location.lat, sel.stop.location.lng], {
        icon: lf.divIcon({ className: "", html: `<div class="pin stop"><span>${glyph}</span></div>`, iconSize: [30, 30], iconAnchor: [4, 30] }),
        title: shown ? sel.stop.name : "Verrassing",
      }).addTo(g);
    }
    if (lastFit.current !== sel.id) {
      lastFit.current = sel.id;
      m.fitBounds(lf.latLngBounds(line(sel)), { padding: [28, 28] });
    }
  }

  useEffect(draw, [routes, selectedId, revealed]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="map" role="application" aria-label="Kaart met je rondje" />;
}
