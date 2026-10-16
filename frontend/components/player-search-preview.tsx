"use client";

import Image from "next/image";
import {
  faceitLevelBadgePath,
  faceitLevelFromElo,
} from "@/lib/premierBadges";
import { PremierRatingBadge } from "@/components/premier-rating-badge";
import {
  steamPresenceLabel,
  type PlayerSearchPreview,
} from "@/lib/playerSearchPreview";

type Props = {
  preview: PlayerSearchPreview;
  onSelect: (steamId: string) => void;
};

export function PlayerSearchSearching() {
  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3.5 shadow-xl"
      role="status"
      aria-live="polite"
    >
      <span
        className="size-5 shrink-0 animate-spin rounded-full border-2 border-accent/30 border-t-accent"
        aria-hidden
      />
      <span className="text-sm text-muted">Searching...</span>
    </div>
  );
}

export function PlayerSearchPreviewCard({ preview, onSelect }: Props) {
  const { label, online } = steamPresenceLabel(
    preview.personaState,
    preview.gameExtraInfo
  );
  const faceitLevel = faceitLevelFromElo(preview.faceitElo);
  const faceitBadge = faceitLevelBadgePath(faceitLevel);
  const initial = preview.displayName.charAt(0).toUpperCase() || "?";

  return (
    <button
      type="button"
      onClick={() => onSelect(preview.steamId)}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left shadow-xl transition-[background-color] hover:bg-[#252528] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:gap-4 sm:px-4 sm:py-3 cursor-pointer"
      role="option"
    >
      <div className="relative shrink-0">
        {preview.avatarUrl ? (
          <span className="relative flex size-11 overflow-hidden rounded-md border border-border sm:size-12">
            <Image
              src={preview.avatarUrl}
              alt=""
              width={48}
              height={48}
              className="size-full object-cover"
              unoptimized={preview.avatarUrl.includes("steam")}
            />
          </span>
        ) : (
          <span className="flex size-11 items-center justify-center rounded-md border border-border bg-muted text-sm font-semibold text-muted sm:size-12">
            {initial}
          </span>
        )}
        <span
          className={`absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-card ${
            online ? "bg-emerald-400" : "bg-zinc-500"
          }`}
          aria-hidden
        />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground sm:text-base">
          {preview.displayName}
        </p>
        <p className={`truncate text-xs sm:text-sm ${online ? "text-emerald-400" : "text-muted"}`}>
          {label}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <PremierRatingBadge rating={preview.premier} height={24} />

        <div
          className="flex items-center gap-1.5 border-l border-border pl-2 sm:pl-3"
          title="FACEIT level & ELO"
        >
          {faceitBadge ? (
            <Image
              src={faceitBadge}
              alt=""
              width={28}
              height={28}
              unoptimized
              className="size-6 object-contain sm:size-7"
            />
          ) : (
            <span className="size-6 rounded-full bg-muted/50 sm:size-7" aria-hidden />
          )}
          <span className="text-sm font-semibold tabular-nums text-foreground sm:text-base">
            {preview.faceitElo != null && Number.isFinite(preview.faceitElo)
              ? Math.round(preview.faceitElo).toLocaleString("en-US")
              : "—"}
          </span>
        </div>
      </div>
    </button>
  );
}
