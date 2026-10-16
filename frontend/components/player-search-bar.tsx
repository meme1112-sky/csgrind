"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { HiSearch } from "react-icons/hi";
import { HiXMark } from "react-icons/hi2";
import { resolveSearchToSteamId64 } from "@/lib/playerSearch";
import { useLivePlayerSearch } from "@/lib/hooks/useLivePlayerSearch";
import {
  PlayerSearchPreviewCard,
  PlayerSearchSearching,
} from "@/components/player-search-preview";

type Props = {
  /** `compact` for the app header; `page` for analytics/profile pages. */
  variant?: "compact" | "page";
  /** Pre-fill with the profile being viewed (display name or Steam ID). */
  currentQuery?: string | null;
  className?: string;
};

export function PlayerSearchBar({
  variant = "compact",
  currentQuery = null,
  className = "",
}: Props) {
  const router = useRouter();
  const [value, setValue] = useState(currentQuery ?? "");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentQuery != null && currentQuery !== "") {
      setValue(currentQuery);
    }
  }, [currentQuery]);

  const trimmed = value.trim();
  // Avoid live-fetching the already-loaded profile when the field is prefilled.
  const queryChanged =
    currentQuery == null ||
    currentQuery === "" ||
    trimmed.toLowerCase() !== currentQuery.trim().toLowerCase();
  const liveEnabled = trimmed.length > 0 && queryChanged;
  const { searching, preview, error: liveError } = useLivePlayerSearch(
    value,
    liveEnabled
  );

  const showPanel = liveEnabled && (searching || !!preview);
  const displayError =
    submitError ?? (liveEnabled && !searching ? liveError : null);

  const goToPlayer = (steamId: string) => {
    router.push(`/player/${steamId}`);
  };

  const runSearch = async () => {
    setSubmitError(null);
    if (preview?.steamId) {
      goToPlayer(preview.steamId);
      return;
    }
    try {
      setLoading(true);
      const steamId = await resolveSearchToSteamId64(value);
      goToPlayer(steamId);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runSearch();
  };

  const isPage = variant === "page";

  return (
    <form
      onSubmit={handleSubmit}
      className={`relative w-full ${className}`.trim()}
      role="search"
      aria-label="Search players"
    >
      <div className={`flex gap-2 ${isPage ? "items-stretch" : "items-center"}`}>
        <div className="relative min-w-0 flex-1">
          {!isPage ? (
            <HiSearch
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted sm:left-3.5 sm:size-[1.125rem]"
              aria-hidden
            />
          ) : null}
          <input
            type="search"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (submitError) setSubmitError(null);
            }}
            placeholder={
              isPage
                ? "SteamID64, Leetify link, Steam URL, or vanity name…"
                : "Search player…"
            }
            disabled={loading}
            aria-invalid={!!displayError}
            aria-describedby={displayError ? "player-search-error" : undefined}
            aria-expanded={!!showPanel}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            className={
              isPage
                ? "h-10 w-full rounded-lg border border-border bg-background py-2 pr-9 pl-3 text-sm text-foreground placeholder:text-muted focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent"
                : "w-full rounded-lg border border-border bg-background py-2 pr-9 pl-9 text-sm text-foreground placeholder:text-muted focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent sm:py-2.5 sm:pl-10"
            }
          />
          {trimmed ? (
            <button
              type="button"
              onClick={() => {
                setValue("");
                setSubmitError(null);
              }}
              className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted hover:text-foreground"
              aria-label="Clear search"
            >
              <HiXMark className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={loading || !trimmed}
          className={
            isPage
              ? "h-10 shrink-0 rounded-lg bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              : "shrink-0 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:text-sm"
          }
        >
          {loading ? "Loading…" : "Load"}
        </button>
      </div>
      {displayError ? (
        <p
          id="player-search-error"
          className={`text-rose-500 ${isPage ? "mt-2 text-sm" : "mt-1.5 text-xs"}`}
          role="alert"
        >
          {displayError}
        </p>
      ) : null}
      {showPanel && !liveError ? (
        <div
          className="absolute top-full right-0 left-0 z-30 mt-1"
          role="listbox"
          aria-label="Search results"
          onMouseDown={(e) => e.preventDefault()}
        >
          {searching ? (
            <PlayerSearchSearching />
          ) : preview ? (
            <PlayerSearchPreviewCard preview={preview} onSelect={goToPlayer} />
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
