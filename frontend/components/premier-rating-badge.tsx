"use client";

import Image from "next/image";
import {
  formatPremierRating,
  premierBadgeFromRating,
} from "@/lib/premierBadges";

type Props = {
  rating: number | null | undefined;
  /** Badge height in px (width follows aspect). */
  height?: number;
  className?: string;
  /** Slightly larger type for wide profile chips. */
  size?: "sm" | "md";
};

/**
 * CS2-style Premier chip: rating number sits inside the bracket parallelogram
 * (empty dark area to the right of the color bars), not beside it.
 */
export function PremierRatingBadge({
  rating,
  height = 28,
  className = "",
  size = "sm",
}: Props) {
  const badge = premierBadgeFromRating(rating);
  const label = formatPremierRating(rating);

  if (!badge) {
    return (
      <span
        className={`text-sm font-semibold text-muted-foreground ${className}`.trim()}
        title="CS2 Premier rating"
      >
        Unranked
      </span>
    );
  }

  const typeClass =
    size === "md"
      ? "text-[13px] sm:text-sm"
      : "text-[11px] sm:text-xs";

  return (
    <span
      className={`relative inline-flex shrink-0 items-center ${className}`.trim()}
      style={{ height }}
      title={`CS2 Premier ${label}`}
    >
      <Image
        src={badge}
        alt={`Premier ${label}`}
        width={Math.round(height * 3.2)}
        height={height}
        quality={100}
        priority
        className="h-full w-auto select-none object-contain"
      />
      {/* Number sits in the dark field of the parallelogram (right of the bars). */}
      <span
        className={`pointer-events-none absolute inset-y-0 left-[34%] right-[8%] flex items-center justify-center font-bold tabular-nums leading-none text-white ${typeClass}`}
        style={{ textShadow: "0 1px 2px rgba(0,0,0,0.85)" }}
      >
        {label}
      </span>
    </span>
  );
}
