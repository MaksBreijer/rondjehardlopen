"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Horizontal chip row that shows it can be swiped: right-edge fade plus a thin position bar underneath. */
export default function QuickRow({ children }: { children: React.ReactNode }) {
  const el = useRef<HTMLDivElement>(null);
  const [m, setM] = useState({ thumb: 100, left: 0, scrollable: false, atEnd: true });

  const update = useCallback(() => {
    const e = el.current;
    if (!e) return;
    const max = e.scrollWidth - e.clientWidth;
    const thumb = Math.min(100, (e.clientWidth / e.scrollWidth) * 100);
    setM({ thumb, left: max > 0 ? (e.scrollLeft / max) * (100 - thumb) : 0, scrollable: max > 2, atEnd: max - e.scrollLeft < 4 });
  }, []);

  useEffect(() => {
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [update]);

  return (
    <div className={`quick-wrap${m.scrollable && !m.atEnd ? " fade" : ""}`}>
      <div className="quick" ref={el} onScroll={update} role="group" aria-label="Snel kiezen">
        {children}
      </div>
      {m.scrollable && (
        <div className="swipe" aria-hidden="true">
          <i style={{ width: `${m.thumb}%`, left: `${m.left}%` }} />
          <span>Swipe voor meer</span>
        </div>
      )}
    </div>
  );
}
