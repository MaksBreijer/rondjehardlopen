"use client";

import { useEffect, useState } from "react";

type Credits = Record<string, { photographer: string; profile: string }>;

/** Shows photographer credits when scripts/fetch-photos.mts has written credits.json. */
export default function PhotoCredits() {
  const [c, setC] = useState<Credits | null>(null);
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_CATEGORY_PHOTOS !== "1") return;
    fetch("/img/categories/credits.json")
      .then((r) => (r.ok ? r.json() : null))
      .then(setC)
      .catch(() => {});
  }, []);
  if (!c) return null;
  const list = Object.values(c);
  return (
    <p className="foot">
      Foto's via <a href="https://unsplash.com/?utm_source=rondjehardlopen&utm_medium=referral" target="_blank" rel="noopener noreferrer">Unsplash</a>:{" "}
      {list.map((p, i) => (
        <span key={p.profile}>
          <a href={p.profile} target="_blank" rel="noopener noreferrer">{p.photographer}</a>
          {i < list.length - 1 ? ", " : ""}
        </span>
      ))}
      .
    </p>
  );
}
