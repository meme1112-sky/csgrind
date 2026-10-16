"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  fetchAnalyticsBySteam,
  fetchAnalyticsJob,
  type AnalyticsBySteamMatch,
} from "@/lib/analyticsBySteam";
import { useAppSelector } from "@/lib/hooks";
import {
  buildFaceitHistoryRows,
  buildPremierRows,
  buildRecentMatchRows,
  enrichFaceitSources,
  formatHltvRating,
  formatLeetifyMatchRating,
  formatRelativeMatchTime,
  hltvRatingClassName,
  isNavigableMatchId,
  leetifyMatchRatingClassName,
  mapImageSrc,
  matchDetailHref,
  selectRecentMatchSources,
  type MatchPlatform,
  type RecentMatchRow,
  type RecentMatchSource,
} from "@/lib/recentMatches";

const MATCH_LIMIT = 30;
/** ~5 rows visible; the rest scroll inside the card. */
const LIST_MAX_HEIGHT = "17.5rem";

type Props = {
  steamId: string | null | undefined;
  premierRating?: number | null;
  faceitElo?: number | null;
  leetifyMatches?: RecentMatchSource[] | null;
  /** Leetify matchmaking / Premier history (display only). */
  premierMatches?: RecentMatchSource[] | null;
  faceitMatches?: RecentMatchSource[] | null;
  /** External sources still loading — show skeleton until first paint of rows or settle. */
  sourcesLoading?: boolean;
};

function OutcomeBadge({ outcome }: { outcome: "W" | "L" }) {
  const win = outcome === "W";
  return (
    <span
      className={`inline-flex h-5 min-w-[1.35rem] items-center justify-center rounded px-1 text-[10px] font-bold leading-none ${
        win
          ? "bg-emerald-500/15 text-emerald-400"
          : "bg-rose-500/15 text-rose-400"
      }`}
      title={win ? "Win" : "Loss"}
    >
      {outcome}
    </span>
  );
}

function MapThumb({ mapKey, mapLabel }: { mapKey: string; mapLabel: string }) {
  const [failed, setFailed] = useState(false);
  const src = failed ? null : mapImageSrc(mapKey);

  if (!src) {
    return (
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted/40 text-[9px] font-semibold tracking-wide text-muted-foreground"
        aria-hidden
      >
        {mapLabel.slice(0, 2)}
      </span>
    );
  }

  return (
    <span className="relative size-9 shrink-0 overflow-hidden rounded-md border border-border/70 bg-zinc-900 shadow-sm">
      <Image
        src={src}
        alt=""
        width={36}
        height={36}
        className="size-full object-contain p-0.5"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

function PlatformChip({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors cursor-pointer ${
        selected
          ? "border-foreground/35 bg-foreground/10 text-foreground"
          : "border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

/** Hover tip on Premier: explain Valve link / login for match clickthrough. */
function PremierChipWithHint({
  selected,
  onToggle,
  loggedIn,
  sessionLoading,
}: {
  selected: boolean;
  onToggle: () => void;
  loggedIn: boolean;
  sessionLoading: boolean;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    showTimer.current = null;
    hideTimer.current = null;
  };

  const placeTip = () => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const tipW = 280;
    const gap = 8;
    let left = rect.left;
    if (left + tipW > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - tipW - 12);
    }
    setCoords({ top: rect.bottom + gap, left });
  };

  const onEnter = () => {
    clearTimers();
    showTimer.current = setTimeout(() => {
      placeTip();
      setOpen(true);
    }, 140);
  };

  const onLeave = () => {
    clearTimers();
    hideTimer.current = setTimeout(() => setOpen(false), 160);
  };

  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => setOpen(false);
    const onResize = () => placeTip();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const tip = sessionLoading
    ? null
    : loggedIn
      ? {
          title: "Unlock Premier match pages",
          body: "Link your Valve auth code + latest share code on your profile. We store the demo so you (and lobby teammates) can open full Premier match stats.",
          ctaHref: "/profile/link-valve",
          ctaLabel: "Link Valve codes",
        }
      : {
          title: "Premier deep stats need a login",
          body: "Sign in with Steam, then submit your Valve auth code + share code. Once a demo is stored, Premier matches become clickable.",
          ctaHref: "/api/auth/steam",
          ctaLabel: "Log in with Steam",
        };

  return (
    <div
      ref={anchorRef}
      className="relative"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
    >
      <PlatformChip label="Premier" selected={selected} onToggle={onToggle} />
      {open && tip && coords && typeof document !== "undefined"
        ? createPortal(
            <div
              role="tooltip"
              className="fixed z-[90] w-[17.5rem] rounded-lg border border-border bg-card p-3 shadow-xl shadow-black/50"
              style={{ top: coords.top, left: coords.left }}
              onMouseEnter={() => {
                clearTimers();
                setOpen(true);
              }}
              onMouseLeave={onLeave}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">
                {tip.title}
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{tip.body}</p>
              <Link
                href={tip.ctaHref}
                className="mt-2.5 inline-flex text-[11px] font-semibold text-foreground underline-offset-2 transition-colors hover:text-accent hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {tip.ctaLabel} →
              </Link>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function MatchRow({
  row,
  href,
}: {
  row: RecentMatchRow;
  href: string | null;
}) {
  const useLeetify = row.platform === "premier" && row.leetifyRating != null;
  const ratingText = useLeetify
    ? formatLeetifyMatchRating(row.leetifyRating)
    : formatHltvRating(row.rating);
  const when = formatRelativeMatchTime(row.finishedAt);
  const lockedPremier = !href && row.platform === "premier";

  const body = (
    <>
      <MapThumb mapKey={row.mapKey} mapLabel={row.mapLabel} />

      <div className="min-w-0">
        <div className="truncate font-semibold tracking-wide text-foreground leading-tight">
          {row.mapLabel}
          {lockedPremier ? (
            <span className="ml-1.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground/70">
              upload to open
            </span>
          ) : null}
        </div>
        {when ? (
          <div className="truncate text-[10px] leading-tight text-muted-foreground/80">{when}</div>
        ) : null}
      </div>

      <span className="text-center tabular-nums text-muted-foreground">
        {row.scoreLabel ?? "—"}
      </span>

      <span className="flex justify-center">
        {row.outcome ? <OutcomeBadge outcome={row.outcome} /> : (
          <span className="text-xs text-muted-foreground/50">·</span>
        )}
      </span>

      <div className="text-right tabular-nums leading-tight">
        {ratingText ? (
          <span
            title={
              useLeetify
                ? "Leetify rating for this match"
                : "HLTV 2.0-style rating from parsed demos"
            }
          >
            <span
              className={`font-semibold ${
                useLeetify
                  ? leetifyMatchRatingClassName(row.leetifyRating)
                  : hltvRatingClassName(row.rating)
              }`}
            >
              {ratingText}
            </span>
          </span>
        ) : (
          <span
            className="text-xs text-muted-foreground/70"
            title={
              row.platform === "premier"
                ? "No Leetify rating — open when a Valve demo is stored"
                : "No parsed demo for this match yet"
            }
          >
            —
          </span>
        )}
      </div>
    </>
  );

  const gridClass =
    "grid grid-cols-[auto_minmax(0,1fr)_3.25rem_1.5rem_3.25rem] items-center gap-x-2 py-1.5 text-sm";

  if (href) {
    return (
      <li>
        <Link
          href={href}
          className={`${gridClass} -mx-1 rounded-md px-1 transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25`}
          aria-label={`Open ${row.mapLabel} match details`}
        >
          {body}
        </Link>
      </li>
    );
  }

  if (lockedPremier) {
    return (
      <li>
        <Link
          href="/upload"
          className={`${gridClass} -mx-1 cursor-pointer rounded-md px-1 text-muted-foreground/90 transition-colors hover:bg-foreground/[0.04] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40`}
          title="No Valve demo stored for this match yet — upload the .dem to open the scoreboard"
          aria-label={`Upload demo to open ${row.mapLabel}`}
        >
          {body}
        </Link>
      </li>
    );
  }

  return <li className={gridClass}>{body}</li>;
}

function emptyCopy(platform: MatchPlatform | null): string {
  if (platform === "faceit") return "No parsed FACEIT demos yet — rating appears after a demo is processed.";
  if (platform === "premier")
    return "No Premier matches yet. Link Valve match codes to store demos, or wait for Leetify history.";
  return "No recent matches available yet.";
}

export function ProfileRecentMatches({
  steamId,
  premierRating,
  faceitElo,
  leetifyMatches,
  premierMatches,
  faceitMatches,
  sourcesLoading = false,
}: Props) {
  const [analyticsMatches, setAnalyticsMatches] = useState<AnalyticsBySteamMatch[] | null>(null);
  const [jobTaskId, setJobTaskId] = useState<string | null>(null);
  const [jobState, setJobState] = useState<string | null>(null);
  const [analyticsStatus, setAnalyticsStatus] = useState<string | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [platform, setPlatform] = useState<MatchPlatform | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollHint, setScrollHint] = useState({ top: false, bottom: false });
  const pathname = usePathname();
  const linkBase = pathname?.startsWith("/profile") ? "profile" : "player";
  const { steamId: sessionSteamId, loading: sessionLoading } = useAppSelector((s: any) => s.session);
  const loggedIn = Boolean(sessionSteamId);

  const updateScrollHint = () => {
    const el = listRef.current;
    if (!el) {
      setScrollHint({ top: false, bottom: false });
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = el;
    setScrollHint({
      top: scrollTop > 6,
      bottom: scrollTop + clientHeight < scrollHeight - 6,
    });
  };

  useEffect(() => {
    setPlatform(null);
  }, [steamId]);

  useEffect(() => {
    if (!steamId) {
      setAnalyticsMatches(null);
      setJobTaskId(null);
      setJobState(null);
      setAnalyticsStatus(null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setAnalyticsLoading(true);
    fetchAnalyticsBySteam(steamId, {
      signal: controller.signal,
      premierRating,
      faceitElo,
      maxMatches: 20,
      scanRecent: 30,
    })
      .then((payload) => {
        if (cancelled) return;
        setAnalyticsMatches(payload.matches ?? []);
        setJobTaskId(payload.job?.task_id ?? null);
        setJobState(payload.job?.state ?? null);
        setAnalyticsStatus(payload.status ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setAnalyticsMatches([]);
          setJobTaskId(null);
          setJobState(null);
          setAnalyticsStatus(null);
        }
      })
      .finally(() => {
        if (!cancelled) setAnalyticsLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [steamId, premierRating, faceitElo]);

  useEffect(() => {
    const shouldPoll =
      steamId &&
      jobTaskId &&
      (jobState === "queued" || analyticsStatus === "refreshing");
    if (!shouldPoll) return;

    const controller = new AbortController();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const status = await fetchAnalyticsJob(jobTaskId, { signal: controller.signal });
        if (cancelled) return;
        if (status.ready) {
          const fresh = await fetchAnalyticsBySteam(steamId, {
            signal: controller.signal,
            premierRating,
            faceitElo,
            refresh: false,
            maxMatches: 20,
            scanRecent: 30,
          });
          if (cancelled) return;
          setAnalyticsMatches(fresh.matches ?? []);
          setJobTaskId(fresh.job?.task_id ?? null);
          setJobState(fresh.job?.state ?? null);
          setAnalyticsStatus(fresh.status ?? null);
          return;
        }
        timer = setTimeout(poll, 4000);
      } catch {
        /* keep prior rows */
      }
    };
    timer = setTimeout(poll, 3000);

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [steamId, jobTaskId, jobState, analyticsStatus, premierRating, faceitElo]);

  const premierHistory = useMemo(() => {
    if (premierMatches && premierMatches.length > 0) return premierMatches;
    return (leetifyMatches ?? []).filter((m) => m.platform === "premier");
  }, [premierMatches, leetifyMatches]);

  const sources = useMemo(() => {
    if (platform === "premier") return [];
    if (platform === "faceit") {
      return enrichFaceitSources(faceitMatches, {
        leetify: leetifyMatches,
        analyticsMatches,
      });
    }
    return selectRecentMatchSources({
      leetify: leetifyMatches,
      faceit: faceitMatches,
      analyticsMatches,
    });
  }, [leetifyMatches, faceitMatches, analyticsMatches, platform]);

  const rows = useMemo(() => {
    if (platform === "premier") {
      return buildPremierRows({
        sources: premierHistory,
        analyticsMatches,
        limit: MATCH_LIMIT,
      });
    }
    if (platform === "faceit") {
      return buildFaceitHistoryRows({
        sources,
        analyticsMatches,
        limit: MATCH_LIMIT,
      });
    }
    return buildRecentMatchRows({
      sources,
      analyticsMatches,
      limit: MATCH_LIMIT,
      platform,
    });
  }, [platform, premierHistory, sources, analyticsMatches]);

  const ratedCount = useMemo(
    () =>
      rows.filter((r) =>
        r.platform === "premier"
          ? r.leetifyRating != null || r.rating != null
          : r.rating != null
      ).length,
    [rows]
  );
  const loading =
    platform === "premier"
      ? rows.length === 0 && (sourcesLoading || analyticsLoading)
      : rows.length === 0 && (sourcesLoading || analyticsLoading);
  const empty = !loading && rows.length === 0;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = 0;
    // Measure after rows paint.
    const id = requestAnimationFrame(updateScrollHint);
    return () => cancelAnimationFrame(id);
  }, [platform, rows.length, loading]);

  const togglePlatform = (next: MatchPlatform) => {
    setPlatform((cur) => (cur === next ? null : next));
  };

  return (
    <div className="border border-border bg-background/80 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Recent Matches
        </h2>
        {platform === "premier" ? (
          <span
            className="text-[10px] text-muted-foreground/80"
            title="Leetify history for browsing. Rows open only after a Valve demo is stored (sync or Upload demo)."
          >
            From Leetify · upload to open
          </span>
        ) : ratedCount > 0 ? (
          <span
            className="text-[10px] text-muted-foreground/80"
            title="HLTV 2.0-style rating from parsed demos"
          >
            HLTV 2.0
          </span>
        ) : !loading && rows.length > 0 ? (
          <span className="text-[10px] text-muted-foreground/60" title="Parsed demos unlock HLTV ratings">
            Rating pending
          </span>
        ) : null}
      </div>

      <div
        className="flex items-center gap-1.5 px-3 pb-1.5"
        role="group"
        aria-label="Filter matches by platform"
      >
        <PlatformChip
          label="FACEIT"
          selected={platform === "faceit"}
          onToggle={() => togglePlatform("faceit")}
        />
        <PremierChipWithHint
          selected={platform === "premier"}
          onToggle={() => togglePlatform("premier")}
          loggedIn={loggedIn}
          sessionLoading={sessionLoading}
        />
      </div>

      {!loading && rows.length > 0 ? (
        <div
          className="grid grid-cols-[auto_minmax(0,1fr)_3.25rem_1.5rem_3.25rem] gap-x-2 px-3 pb-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground/55"
          aria-hidden
        >
          <span className="size-9" />
          <span>Map</span>
          <span className="text-center">Score</span>
          <span className="text-center"> </span>
          <span className="text-right">Rating</span>
        </div>
      ) : null}

      {loading ? (
        <ul className="px-3 pb-2.5 space-y-2" aria-busy="true" aria-label="Loading recent matches">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="flex items-center gap-2.5">
              <span className="size-9 shrink-0 animate-pulse rounded-md bg-muted/40" />
              <span className="h-5 flex-1 animate-pulse rounded bg-muted/40" />
            </li>
          ))}
        </ul>
      ) : empty ? (
        <p className="px-3 pb-3 text-xs text-muted-foreground">{emptyCopy(platform)}</p>
      ) : (
        <div className="relative">
          {scrollHint.top ? (
            <div
              className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-background to-transparent"
              aria-hidden
            />
          ) : null}
          <div
            ref={listRef}
            onScroll={updateScrollHint}
            className="overflow-y-auto overscroll-contain px-3 pb-1.5 [scrollbar-width:thin] [scrollbar-color:rgba(250,250,250,0.22)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-foreground/20 hover:[&::-webkit-scrollbar-thumb]:bg-foreground/35"
            style={{ maxHeight: LIST_MAX_HEIGHT }}
            tabIndex={rows.length > 5 ? 0 : undefined}
            aria-label="Recent match list"
          >
            <ul className="divide-y divide-border/60">
              {rows.map((row) => {
                const mid = row.matchId;
                const canOpen = Boolean(steamId) && isNavigableMatchId(mid);
                const href =
                  canOpen && steamId && mid
                    ? matchDetailHref({
                        playerId: steamId,
                        matchId: mid,
                        platform: row.platform,
                        base: linkBase,
                      })
                    : null;
                return (
                  <MatchRow key={row.id} row={row} href={href} />
                );
              })}
            </ul>
          </div>
          {scrollHint.bottom ? (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-7 bg-gradient-to-t from-background to-transparent"
              aria-hidden
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
