"use client";

import { useEffect, useRef, useState } from "react";

/** Counts a distance in km up from 0 with an ease-out curve; respects reduced motion. */
export default function CountUp({ meters, ms = 1100 }: { meters: number; ms?: number }) {
  const [v, setV] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setV(meters);
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(meters * (1 - Math.pow(1 - p, 4)));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [meters, ms]);
  return <>{(v / 1000).toFixed(1).replace(".", ",")} km</>;
}
