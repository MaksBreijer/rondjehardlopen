import type { Category } from "@/lib/types";

const BIG: Record<Category | "none", string> = { coffee: "☕", bakery: "🥐", supermarket: "🛒", green: "🌳", surprise: "🎁", none: "🏃" };

/** Large Apple-style emoji as the tile picture. */
export function Art({ id }: { id: Category | "none" }) {
  return (
    <span className="big-emo" role="img" aria-hidden="true">
      {BIG[id]}
    </span>
  );
}
