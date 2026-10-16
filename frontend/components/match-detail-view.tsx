"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { HiArrowLeft, HiChevronDown, HiChevronUp, HiStar } from "react-icons/hi2";
import {
  faceitLevelBadgePath,
  faceitLevelColor,
} from "@/lib/premierBadges";
import { PremierRatingBadge } from "@/components/premier-rating-badge";
import {
  formatHltvRating,
  formatRelativeMatchTime,
  hltvRatingClassName,
  mapImageSrc,
  type MatchPlatform,
} from "@/lib/recentMatches";
import {
  loadMatchDetail,
  topPerformers,
  type MatchDetailPlayer,
  type MatchDetailViewModel,
  type MatchTeamAvg,
} from "@/lib/matchDetail";
import {
  computeIntegritySignals,
  integrityStatusClass,
  integrityStatusLabel,
} from "@/lib/integritySignals";

type Props = {
  playerId: string;
  matchId: string;
  platform?: MatchPlatform | null;
  /** Where the back link should return. */
  backBase?: "player" | "profile";
};

function PlatformBadge({ platform }: { platform: MatchPlatform | null }) {
  if (!platform) return null;
  return (
    <span className="inline-flex items-center rounded-full border border-white/15 bg-black/40 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/85 backdrop-blur-sm">
      {platform === "faceit" ? "FACEIT" : "Premier"}
    </span>
  );
}

function MapChip({ mapKey, mapLabel }: { mapKey: string; mapLabel: string }) {
  const [failed, setFailed] = useState(false);
  const src = failed ? null : mapImageSrc(mapKey);

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 py-0.5 pl-0.5 pr-2.5 text-[11px] font-semibold tracking-wide text-white/90 backdrop-blur-sm">
      {src ? (
        <span className="relative size-5 overflow-hidden rounded-full bg-zinc-900">
          <Image
            src={src}
            alt=""
            width={20}
            height={20}
            className="size-full object-cover"
            onError={() => setFailed(true)}
          />
        </span>
      ) : (
        <span className="flex size-5 items-center justify-center rounded-full bg-white/10 text-[8px]">
          {mapLabel.slice(0, 2)}
        </span>
      )}
      {mapLabel}
    </span>
  );
}

function fmtKd(kills: number | null, deaths: number | null): string {
  if (kills == null || deaths == null) return "—";
  if (deaths === 0) return kills.toFixed(2);
  return (kills / deaths).toFixed(2);
}

function fmtPct(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const pct = v <= 1 ? v * 100 : v;
  return `${pct.toFixed(1)}%`;
}

function fmtAdr(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(1);
}

function StatChip({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border/70 bg-card/90 px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
        {label}
      </div>
      <div className={`mt-1 truncate text-lg font-semibold tabular-nums ${valueClass ?? "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}

function FocusStrip({ focus }: { focus: MatchDetailPlayer }) {
  const ratingText = formatHltvRating(focus.rating) ?? "—";
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <StatChip label="Rating" value={ratingText} valueClass={hltvRatingClassName(focus.rating)} />
      <StatChip label="K / D" value={`${focus.kills ?? "—"} / ${focus.deaths ?? "—"}`} />
      <StatChip label="K/D ratio" value={fmtKd(focus.kills, focus.deaths)} />
      <StatChip label="ADR" value={fmtAdr(focus.adr)} />
      <StatChip label="KAST" value={fmtPct(focus.kast)} />
      <StatChip label="HS%" value={fmtPct(focus.hsPct)} />
    </div>
  );
}

/** Per-match Neok AI aim signals from the parsed demo (TTD / crosshair). */
function MatchAimIntegrity({
  focus,
  platform,
  premierRating,
  faceitElo,
}: {
  focus: MatchDetailPlayer;
  platform: MatchPlatform | null;
  /** Profile Premier rating (viewer / page owner) when known. */
  premierRating?: number | null;
  /** FACEIT Elo for bracket mapping when Premier is unranked. */
  faceitElo?: number | null;
}) {
  const signals = useMemo(() => {
    if (focus.timeToDamage == null && focus.crosshairPlacement == null) return [];
    // Prefer per-player fields; fall back to page-owner profile ranks for the focus player.
    const elo = focus.faceitElo ?? faceitElo ?? null;
    const premier = focus.premierRating ?? premierRating ?? null;
    return computeIntegritySignals(
      {
        time_to_damage: focus.timeToDamage,
        crosshair_placement: focus.crosshairPlacement,
        kd:
          focus.kills != null && focus.deaths != null && focus.deaths > 0
            ? focus.kills / focus.deaths
            : focus.kills != null && focus.deaths === 0
              ? focus.kills
              : null,
      },
      null,
      premier,
      focus.steamId,
      null,
      1,
      elo
    ).filter((s) => s.id === "ttd" || s.id === "preaim");
  }, [focus, premierRating, faceitElo]);

  if (signals.length === 0) return null;

  return (
    <section className="space-y-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Neok AI · this demo
        </h2>
        <p className="text-[11px] text-muted-foreground">
          {platform === "premier" ? "Premier/Valve parse" : "Demo parse"} · TTD / crosshair
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {signals.map((s) => (
          <div
            key={s.id}
            className="rounded-xl border border-border/70 bg-card/90 px-3 py-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
                {s.label}
              </span>
              <span className={`text-[11px] font-semibold ${integrityStatusClass(s.status)} px-[5px] py-0`}>
                {integrityStatusLabel(s.status)}
              </span>
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{s.value}</div>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{s.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function RatingRing({ rating, size = 72 }: { rating: number | null; size?: number }) {
  const r = rating != null && Number.isFinite(rating) ? rating : 0;
  // Map ~0.5–1.5 HLTV into a ring fill; 1.00 ≈ 55%, 1.50 ≈ 100%.
  const fill = Math.max(0.12, Math.min(1, (r - 0.4) / 1.1));
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const c = 2 * Math.PI * radius;
  const dash = c * fill;
  const colorClass =
    r >= 1.15 ? "stroke-emerald-400" : r >= 0.95 ? "stroke-foreground" : "stroke-rose-400";

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-white/10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          className={colorClass}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-sm font-semibold tabular-nums ${hltvRatingClassName(rating)}`}>
          {formatHltvRating(rating) ?? "—"}
        </span>
      </div>
    </div>
  );
}

function PlayerAvatar({
  player,
  focused,
  size = 36,
}: {
  player: Pick<MatchDetailPlayer, "name" | "faceitNickname" | "avatarUrl">;
  focused?: boolean;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const label = player.faceitNickname || player.name;
  const initial = (label.trim()[0] || "?").toUpperCase();
  const src = !failed && player.avatarUrl ? player.avatarUrl : null;

  useEffect(() => {
    setFailed(false);
  }, [player.avatarUrl]);

  const ring = focused ? "ring-2 ring-accent/50" : "ring-1 ring-border";

  if (src) {
    return (
      <span
        className={`relative inline-block shrink-0 overflow-hidden rounded-full bg-zinc-900 ${ring}`}
        style={{ width: size, height: size, minWidth: size, minHeight: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- remote FACEIT CDN avatars */}
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-xs font-bold ${ring} ${
        focused ? "bg-accent/25 text-accent" : "bg-muted/50 text-foreground/80"
      }`}
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
      aria-hidden
    >
      {initial}
    </span>
  );
}

function PlayerInfoCard({ player }: { player: MatchDetailPlayer }) {
  const displayName = player.faceitNickname || player.name;
  const levelBadge = faceitLevelBadgePath(player.faceitSkillLevel);
  const profileHref = player.steamId
    ? `/player/${encodeURIComponent(player.steamId)}`
    : null;

  return (
    <div className="w-[17.5rem] overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-black/40">
      <div className="flex items-center gap-3 border-b border-border/70 bg-muted/20 px-3 py-3">
        <PlayerAvatar player={player} size={44} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{displayName}</div>
          <div className="mt-0.5 flex items-center gap-1.5">
            {levelBadge ? (
              <Image
                src={levelBadge}
                alt={`FACEIT level ${player.faceitSkillLevel}`}
                width={18}
                height={18}
                className="size-[18px] object-contain"
              />
            ) : null}
            {player.faceitSkillLevel != null ? (
              <span className="text-[11px] text-muted-foreground">
                Level {player.faceitSkillLevel}
                {player.faceitElo != null
                  ? ` · ${player.faceitElo.toLocaleString("en-US")} Elo`
                  : ""}
              </span>
            ) : player.faceitElo != null ? (
              <span className="text-[11px] text-muted-foreground">
                {player.faceitElo.toLocaleString("en-US")} Elo
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground">Match stats</span>
            )}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-px bg-border/50 p-px">
        {(
          [
            ["Rating", formatHltvRating(player.rating) ?? "—", hltvRatingClassName(player.rating)],
            ["K / D", `${player.kills ?? "—"}/${player.deaths ?? "—"}`, "text-foreground"],
            ["ADR", fmtAdr(player.adr), "text-foreground"],
            ["KAST", fmtPct(player.kast), "text-foreground"],
            ["HS%", fmtPct(player.hsPct), "text-foreground"],
            ["K/D", fmtKd(player.kills, player.deaths), "text-foreground"],
          ] as const
        ).map(([label, value, cls]) => (
          <div key={label} className="bg-card px-2.5 py-2">
            <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/75">
              {label}
            </div>
            <div className={`mt-0.5 text-sm font-semibold tabular-nums ${cls}`}>{value}</div>
          </div>
        ))}
      </div>
      {profileHref ? (
        <div className="border-t border-border/70 px-3 py-2">
          <Link
            href={profileHref}
            className="text-[11px] font-semibold text-accent transition-colors hover:text-accent-hover"
          >
            View profile →
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function PlayerHoverAnchor({
  player,
  children,
}: {
  player: MatchDetailPlayer;
  children: ReactNode;
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

  const placeCard = () => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cardW = 50;
    const gap = 100;
    // Prefer left of the player name so the card doesn't cover the scoreboard columns.
    let left = rect.right - cardW + gap;
    if (left < 14) {
      // Fall back: align to the player cell’s left edge (still on the left of the table).
      left = Math.max(14, Math.min(rect.left, window.innerWidth - cardW - 12));
    }
    let top = rect.top + rect.height / 2 - 90;
    top = Math.max(12, Math.min(top, window.innerHeight - 220));
    setCoords({ top, left });
  };

  const onEnter = () => {
    clearTimers();
    showTimer.current = setTimeout(() => {
      placeCard();
      setOpen(true);
    }, 160);
  };

  const onLeave = () => {
    clearTimers();
    hideTimer.current = setTimeout(() => setOpen(false), 120);
  };

  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => setOpen(false);
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [open]);

  return (
    <div
      ref={anchorRef}
      className="relative inline-flex max-w-full min-w-0"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
    >
      {children}
      {open && coords && typeof document !== "undefined"
        ? createPortal(
            <div
              className="pointer-events-auto fixed z-[80]"
              style={{ top: coords.top, left: coords.left }}
              onMouseEnter={() => {
                clearTimers();
                setOpen(true);
              }}
              onMouseLeave={onLeave}
              role="dialog"
              aria-label={`${player.faceitNickname || player.name} match stats`}
            >
              <PlayerInfoCard player={player} />
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function TopPerformers({ players }: { players: MatchDetailPlayer[] }) {
  const top = topPerformers(players, 3);
  if (top.length === 0) return null;

  const places = [
    {
      label: "1st",
      labelClass: "text-amber-400",
      badgeClass: "bg-amber-500 text-black ring-amber-400/50",
    },
    {
      label: "2nd",
      labelClass: "text-slate-300",
      badgeClass: "bg-slate-300 text-slate-900 ring-slate-400/50",
    },
    {
      label: "3rd",
      labelClass: "text-orange-400",
      badgeClass: "bg-orange-500 text-black ring-orange-400/50",
    },
  ] as const;

  return (
    <section className="space-y-2.5">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Top performers
      </h2>
      <div className="grid gap-2 sm:grid-cols-3">
        {top.map((p, i) => {
          const place = places[i] ?? places[2];
          return (
            <div
              key={`${p.steamId ?? p.name}-${i}`}
              className="flex h-full items-center gap-2.5 rounded-xl border border-border/70 bg-card/90 px-3 py-2.5"
            >
              <div className="relative shrink-0">
                <PlayerAvatar player={p} size={42} />
                <span
                  className={`absolute -bottom-0.5 -right-0.5 z-[1] flex size-4 items-center justify-center rounded-full text-[8px] font-bold leading-none ring-1 ${place.badgeClass}`}
                >
                  {i + 1}
                </span>
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div
                  className={`text-[10px] font-semibold uppercase tracking-wide ${place.labelClass}`}
                >
                  {place.label}
                </div>
                <div className="truncate text-sm font-semibold leading-tight text-foreground">
                  {p.faceitNickname || p.name}
                </div>
                <div className="truncate text-[11px] leading-tight tabular-nums text-muted-foreground">
                  {p.kills ?? "—"}/{p.deaths ?? "—"}
                  <span className="text-muted-foreground/50"> · </span>
                  ADR {fmtAdr(p.adr)}
                </div>
              </div>
              <RatingRing rating={p.rating} size={56} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MetricBar({
  value,
  max,
  tone = "neutral",
}: {
  value: number | null;
  max: number;
  tone?: "good" | "bad" | "neutral";
}) {
  if (value == null || !Number.isFinite(value) || max <= 0) return null;
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const bar =
    tone === "good"
      ? "bg-emerald-500/35"
      : tone === "bad"
        ? "bg-rose-500/30"
        : "bg-foreground/15";
  return (
    <span
      className={`pointer-events-none absolute inset-y-1 left-0 rounded ${bar}`}
      style={{ width: `${pct}%` }}
      aria-hidden
    />
  );
}

type ScoreboardSortKey = "rank" | "kills" | "deaths" | "adr" | "kast" | "hs" | "rating";

function sortValue(p: MatchDetailPlayer, key: ScoreboardSortKey): number {
  switch (key) {
    case "rank":
      return p.faceitSkillLevel ?? p.faceitElo ?? p.premierRating ?? -1;
    case "kills":
      return p.kills ?? -1;
    case "deaths":
      return p.deaths ?? -1;
    case "adr":
      return p.adr ?? -1;
    case "kast": {
      if (p.kast == null || !Number.isFinite(p.kast)) return -1;
      return p.kast <= 1 ? p.kast * 100 : p.kast;
    }
    case "hs": {
      if (p.hsPct == null || !Number.isFinite(p.hsPct)) return -1;
      return p.hsPct <= 1 ? p.hsPct * 100 : p.hsPct;
    }
    case "rating":
      return p.rating ?? -1;
  }
}

function RankCell({
  level,
  elo = null,
  premierRating = null,
  preferPremier = false,
}: {
  level: number | null;
  /** Current FACEIT Elo — shown beside the level icon (Faceit-style). */
  elo?: number | null;
  /** CS2 Premier rating when FACEIT rank is unavailable. */
  premierRating?: number | null;
  /** Premier match pages: show Premier badge when FACEIT is missing. */
  preferPremier?: boolean;
}) {
  const eloLabel =
    elo != null && Number.isFinite(elo) ? Math.round(elo).toLocaleString("en-US") : null;
  const hasFaceit = level != null || eloLabel != null;

  if (preferPremier && !hasFaceit) {
    return (
      <span className="inline-flex items-center justify-center">
        <PremierRatingBadge rating={premierRating} height={22} />
      </span>
    );
  }

  const title =
    level != null && eloLabel != null
      ? `FACEIT level ${level} · ${eloLabel} Elo`
      : level != null
        ? `FACEIT level ${level}`
        : eloLabel != null
          ? `${eloLabel} Elo`
          : undefined;

  if (level == null && eloLabel == null) {
    return <span className="text-muted-foreground/50">—</span>;
  }

  const badge = level != null ? faceitLevelBadgePath(level) : null;
  const levelIcon =
    level == null ? null : badge ? (
      <Image
        src={badge}
        alt={`Level ${level}`}
        width={22}
        height={22}
        className="size-[22px] object-contain"
      />
    ) : (
      <span
        className="inline-flex size-[22px] items-center justify-center rounded-full text-[10px] font-bold text-white"
        style={{ backgroundColor: faceitLevelColor(level) }}
      >
        {level}
      </span>
    );

  return (
    <span
      className="inline-flex items-center justify-center gap-1.5"
      title={title}
    >
      {levelIcon}
      {eloLabel != null ? (
        <span className="text-[12px] font-semibold tabular-nums text-foreground">{eloLabel}</span>
      ) : null}
    </span>
  );
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: ScoreboardSortKey;
  activeKey: ScoreboardSortKey;
  dir: "asc" | "desc";
  onSort: (key: ScoreboardSortKey) => void;
}) {
  const active = activeKey === sortKey;
  return (
    <th className="px-1.5 py-2 text-center font-semibold">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`relative mx-auto block cursor-pointer uppercase tracking-[0.12em] transition-colors ${
          active
            ? "text-foreground"
            : "text-muted-foreground/70 hover:text-muted-foreground"
        }`}
        aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      >
        <span>{label}</span>
        <span
          className={`pointer-events-none absolute top-1/2 left-[calc(100%+2px)] inline-flex -translate-y-1/2 ${
            active ? "text-accent" : "text-muted-foreground/40"
          }`}
          aria-hidden
        >
          {active && dir === "asc" ? (
            <HiChevronUp className="size-3" />
          ) : (
            <HiChevronDown className="size-3" />
          )}
        </span>
      </button>
    </th>
  );
}

function ScoreboardTable({
  players,
  selectedKey,
  title,
  badge,
  teamAvg = null,
  platform = null,
  onSelectPlayer,
}: {
  players: MatchDetailPlayer[];
  /** `playerKey` of the inspected player (highlight + Focus badge). */
  selectedKey: string | null;
  title: string;
  badge?: "win" | "lose";
  teamAvg?: MatchTeamAvg | null;
  platform?: MatchPlatform | null;
  /** Click a row to inspect that player's performance / Neok AI for this demo. */
  onSelectPlayer?: (player: MatchDetailPlayer) => void;
}) {
  const preferPremier = platform === "premier";
  const [sortKey, setSortKey] = useState<ScoreboardSortKey>("rating");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const onSort = (key: ScoreboardSortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(key);
    setSortDir("desc");
  };

  const sorted = useMemo(() => {
    const copy = [...players];
    copy.sort((a, b) => {
      const cmp = sortValue(a, sortKey) - sortValue(b, sortKey);
      if (cmp !== 0) return sortDir === "asc" ? cmp : -cmp;
      const ar = a.rating ?? -1;
      const br = b.rating ?? -1;
      if (ar !== br) {
        const ratingCmp = ar - br;
        return sortDir === "asc" ? ratingCmp : -ratingCmp;
      }
      return (a.faceitNickname || a.name).localeCompare(b.faceitNickname || b.name);
    });
    return copy;
  }, [players, sortKey, sortDir]);

  if (players.length === 0) return null;

  const maxAdr = Math.max(...players.map((p) => p.adr ?? 0), 1);
  const maxRating = Math.max(...players.map((p) => p.rating ?? 0), 1);
  const bestRating = Math.max(...players.map((p) => p.rating ?? -Infinity));

  // Prefer FACEIT lobby team stats; fall back to roster skill-level mean.
  const levels = players
    .map((p) => p.faceitSkillLevel)
    .filter((n): n is number => n != null && Number.isFinite(n));
  const fallbackAvgLevel =
    levels.length > 0 ? levels.reduce((a, b) => a + b, 0) / levels.length : null;
  const avgLevelRaw = teamAvg?.avgLevel ?? fallbackAvgLevel;
  const avgLevelRounded =
    avgLevelRaw != null ? Math.min(10, Math.max(1, Math.round(avgLevelRaw))) : null;
  const avgElo = teamAvg?.avgElo ?? null;

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card/60">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {title}
          </h3>
          {badge === "win" ? (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">
              Win
            </span>
          ) : null}
          {badge === "lose" ? (
            <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-400">
              Loss
            </span>
          ) : null}
        </div>
        {avgLevelRounded != null || avgElo != null ? (
          <div
            className="flex shrink-0 items-center gap-1.5"
            title={
              avgElo != null
                ? `Team average FACEIT Elo ${avgElo.toLocaleString("en-US")}`
                : avgLevelRaw != null
                  ? `Team average FACEIT level ${avgLevelRaw.toFixed(1)}`
                  : undefined
            }
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
              Avg
            </span>
            <RankCell level={avgLevelRounded} elo={avgElo} />
            {avgElo == null && avgLevelRaw != null ? (
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {avgLevelRaw.toFixed(1)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] table-fixed border-collapse text-sm">
          <colgroup>
            {/* Nickname + Focus; Rank holds level icon + Elo (Faceit-style). */}
            <col className="w-[11rem]" />
            <col className="w-[5.75rem]" />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr className="text-[10px] font-semibold tracking-[0.12em]">
              <th className="w-[11rem] px-2 py-2 text-left font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                Player
              </th>
              <SortHeader label="Rank" sortKey="rank" activeKey={sortKey} dir={sortDir} onSort={onSort} />
              <SortHeader label="K" sortKey="kills" activeKey={sortKey} dir={sortDir} onSort={onSort} />
              <SortHeader label="D" sortKey="deaths" activeKey={sortKey} dir={sortDir} onSort={onSort} />
              <SortHeader label="ADR" sortKey="adr" activeKey={sortKey} dir={sortDir} onSort={onSort} />
              <SortHeader label="KAST" sortKey="kast" activeKey={sortKey} dir={sortDir} onSort={onSort} />
              <SortHeader label="HS%" sortKey="hs" activeKey={sortKey} dir={sortDir} onSort={onSort} />
              <SortHeader
                label="Rating"
                sortKey="rating"
                activeKey={sortKey}
                dir={sortDir}
                onSort={onSort}
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {sorted.map((p, i) => {
              const focused = Boolean(selectedKey && playerKey(p) === selectedKey);
              const isBest = p.rating != null && p.rating === bestRating && bestRating > -Infinity;
              const selectable = Boolean(onSelectPlayer);
              return (
                <tr
                  key={`${p.steamId ?? p.name}-${i}`}
                  className={`${focused ? "bg-accent/[0.06]" : "hover:bg-foreground/[0.03]"} ${
                    selectable ? "cursor-pointer" : ""
                  }`}
                  onClick={selectable ? () => onSelectPlayer?.(p) : undefined}
                  onKeyDown={
                    selectable
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSelectPlayer?.(p);
                          }
                        }
                      : undefined
                  }
                  tabIndex={selectable ? 0 : undefined}
                  role={selectable ? "button" : undefined}
                  aria-pressed={selectable ? focused : undefined}
                  title={selectable ? "Show performance & Neok AI for this player" : undefined}
                >
                  <td className="w-[11rem] max-w-[11rem] overflow-hidden px-2 py-2.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <PlayerHoverAnchor player={p}>
                        <span className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
                          <PlayerAvatar player={p} focused={focused} size={28} />
                          <span className="min-w-0 truncate text-[13px] font-medium text-foreground">
                            {p.faceitNickname || p.name}
                          </span>
                        </span>
                      </PlayerHoverAnchor>
                      {focused ? (
                        <span className="shrink-0 rounded border border-accent/40 bg-accent/10 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-accent">
                          Focus
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-1.5 py-2.5 text-center">
                    <RankCell
                      level={p.faceitSkillLevel}
                      elo={p.faceitElo}
                      premierRating={p.premierRating}
                      preferPremier={preferPremier}
                    />
                  </td>
                  <td className="px-1.5 py-2.5 text-center tabular-nums text-muted-foreground">
                    {p.kills ?? "—"}
                  </td>
                  <td className="px-1.5 py-2.5 text-center tabular-nums text-muted-foreground">
                    {p.deaths ?? "—"}
                  </td>
                  <td className="relative px-1.5 py-2.5 text-center tabular-nums text-muted-foreground">
                    <MetricBar value={p.adr} max={maxAdr} tone="neutral" />
                    <span className="relative">{fmtAdr(p.adr)}</span>
                  </td>
                  <td className="px-1.5 py-2.5 text-center tabular-nums text-muted-foreground">
                    {fmtPct(p.kast)}
                  </td>
                  <td className="px-1.5 py-2.5 text-center tabular-nums text-muted-foreground">
                    {fmtPct(p.hsPct)}
                  </td>
                  <td className="relative px-1.5 py-2.5 text-center tabular-nums">
                    <MetricBar
                      value={p.rating}
                      max={maxRating}
                      tone={
                        p.rating != null && p.rating >= 1.15
                          ? "good"
                          : p.rating != null && p.rating < 0.95
                            ? "bad"
                            : "neutral"
                      }
                    />
                    <span className="relative inline-flex items-center justify-center gap-1">
                      {isBest ? <HiStar className="size-3 text-accent" aria-label="Best rating" /> : null}
                      <span className={`font-semibold ${hltvRatingClassName(p.rating)}`}>
                        {formatHltvRating(p.rating) ?? "—"}
                      </span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MatchHero({ model, when }: { model: MatchDetailViewModel; when: string | null }) {
  const [bgFailed, setBgFailed] = useState(false);
  const bg = !bgFailed ? mapImageSrc(model.mapKey) : null;
  const victory = model.outcome === "W";
  const defeat = model.outcome === "L";
  const headline = victory ? "Victory" : defeat ? "Defeat" : "Match";
  const headlineClass = victory
    ? "text-emerald-400"
    : defeat
      ? "text-rose-400"
      : "text-foreground";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card">
      {bg ? (
        <>
          <Image
            src={bg}
            alt=""
            fill
            priority
            className="object-cover object-center scale-125 blur-[2px] opacity-35"
            onError={() => setBgFailed(true)}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-background/30" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-card to-background" />
      )}

      <div className="relative flex min-h-[10.5rem] flex-col justify-between gap-4 p-5 sm:min-h-[12rem] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1
                className={`text-3xl font-bold uppercase tracking-wide sm:text-4xl ${headlineClass}`}
              >
                {headline}
              </h1>
              <span className="text-3xl font-semibold tabular-nums text-foreground sm:text-4xl">
                {model.scoreDisplay ?? model.scoreLabel ?? "—"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <MapChip mapKey={model.mapKey} mapLabel={model.mapLabel} />
              <PlatformBadge platform={model.platform} />
              {model.focus?.rating != null ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-2.5 py-0.5 text-[11px] backdrop-blur-sm">
                  <span className="text-white/55">HLTV</span>
                  <span className={`font-semibold tabular-nums ${hltvRatingClassName(model.focus.rating)}`}>
                    {formatHltvRating(model.focus.rating)}
                  </span>
                </span>
              ) : null}
            </div>
          </div>
          {when ? (
            <div className="text-right text-xs text-white/55 sm:text-sm">{when}</div>
          ) : null}
        </div>

        <div className="flex items-center gap-4 border-t border-white/10 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em]">
          <span className="text-accent">Overview</span>
          <span className="text-white/30">Scoreboard</span>
        </div>
      </div>
    </div>
  );
}

function StatusBanner({ model }: { model: MatchDetailViewModel }) {
  if (!model.message) return null;
  const tone =
    model.status === "error"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
      : model.status === "pending"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
        : "border-border bg-muted/30 text-muted-foreground";
  return <p className={`rounded-xl border px-3 py-2.5 text-sm ${tone}`}>{model.message}</p>;
}

/** CTA when Premier scoreboard is locked (pending / missing demo / error). */
function PremierUploadCta({
  shareCode,
  status,
}: {
  shareCode: string;
  status: MatchDetailViewModel["status"];
}) {
  const uploadHref = `/upload?share=${encodeURIComponent(shareCode)}`;
  const lead =
    status === "pending"
      ? "Waiting on Steam sync, or upload the .dem yourself to unlock this scoreboard."
      : status === "error"
        ? "Processing failed for this match. You can still upload the .dem and re-parse."
        : "No stored Valve demo yet. Upload the .dem manually, or link Valve codes for sync.";

  return (
    <div className="rounded-xl border border-accent/25 bg-accent/5 px-4 py-3.5 text-sm">
      <p className="text-foreground/90">{lead}</p>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        <Link href={uploadHref} className="font-medium text-accent hover:underline">
          Upload demo →
        </Link>
        <Link href="/profile/link-valve" className="text-muted-foreground hover:text-foreground hover:underline">
          Link Valve codes
        </Link>
      </p>
    </div>
  );
}

function MatchDetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading match">
      <span className="block h-44 animate-pulse rounded-2xl bg-muted/30" />
      <div className="grid gap-2 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <span key={i} className="h-24 animate-pulse rounded-xl bg-muted/25" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className="h-16 animate-pulse rounded-xl bg-muted/25" />
        ))}
      </div>
      <span className="block h-56 animate-pulse rounded-xl bg-muted/20" />
    </div>
  );
}

function playerKey(p: MatchDetailPlayer): string {
  return (p.steamId || p.name).trim();
}

export function MatchDetailView({
  playerId,
  matchId,
  platform = null,
  backBase = "player",
}: Props) {
  const [model, setModel] = useState<MatchDetailViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  /** Page-owner Premier / FACEIT ranks for Neok AI brackets (not mid-band default). */
  const [ownerPremier, setOwnerPremier] = useState<number | null>(null);
  const [ownerFaceitElo, setOwnerFaceitElo] = useState<number | null>(null);
  /** Scoreboard selection — drives Performance + Neok AI strips. */
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const inspectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setModel(null);
    setSelectedKey(null);
    loadMatchDetail({
      matchId,
      steamId: playerId,
      platform,
      signal: controller.signal,
    })
      .then((next) => {
        if (cancelled) return;
        setModel(next);
        const initial = next.focus ?? next.players[0] ?? null;
        setSelectedKey(initial ? playerKey(initial) : null);
      })
      .catch(() => {
        if (!cancelled) {
          setModel({
            matchId,
            status: "error",
            pipelineStatus: null,
            platform,
            mapLabel: "UNKNOWN",
            mapKey: "",
            scoreUs: null,
            scoreThem: null,
            scoreLabel: null,
            scoreDisplay: null,
            outcome: null,
            finishedAt: null,
            players: [],
            winningTeam: [],
            losingTeam: [],
            winningTeamAvg: null,
            losingTeamAvg: null,
            teamsResolved: false,
            focus: null,
            message: "Failed to load this match.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [matchId, playerId, platform]);

  useEffect(() => {
    if (!playerId) return;
    let cancelled = false;
    fetch(`/api/user/profile/${encodeURIComponent(playerId)}/stats?preview=1`, {
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { premier?: number | null; faceitElo?: number | null } | null) => {
        if (cancelled || !data) return;
        const premier =
          typeof data.premier === "number" && Number.isFinite(data.premier) ? data.premier : null;
        const elo =
          typeof data.faceitElo === "number" && Number.isFinite(data.faceitElo)
            ? data.faceitElo
            : null;
        setOwnerPremier(premier);
        setOwnerFaceitElo(elo);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  /** Merge page-owner Premier / FACEIT ranks onto lobby rows (no race with match load). */
  const viewModel = useMemo(() => {
    if (!model) return null;
    if (ownerPremier == null && ownerFaceitElo == null) return model;
    if (model.players.length === 0) return model;
    const players = model.players.map((p) =>
      p.steamId === playerId
        ? {
            ...p,
            premierRating: p.premierRating ?? ownerPremier,
            faceitElo: p.faceitElo ?? ownerFaceitElo,
          }
        : p
    );
    const focus =
      model.focus?.steamId === playerId
        ? players.find((p) => p.steamId === playerId) ?? model.focus
        : model.focus;
    const patchTeam = (team: MatchDetailPlayer[]) =>
      team.map((p) => players.find((x) => playerKey(x) === playerKey(p)) ?? p);
    return {
      ...model,
      players,
      focus,
      winningTeam: patchTeam(model.winningTeam),
      losingTeam: patchTeam(model.losingTeam),
    };
  }, [model, playerId, ownerPremier, ownerFaceitElo]);

  const backHref = `/${backBase}/${encodeURIComponent(playerId)}`;
  const when = viewModel ? formatRelativeMatchTime(viewModel.finishedAt) : null;

  const selectedPlayer = useMemo(() => {
    if (!viewModel?.players.length) return null;
    if (selectedKey) {
      const hit = viewModel.players.find((p) => playerKey(p) === selectedKey);
      if (hit) return hit;
    }
    return viewModel.focus ?? viewModel.players[0] ?? null;
  }, [viewModel, selectedKey]);

  const selectedIsProfileOwner = Boolean(
    selectedPlayer?.steamId && selectedPlayer.steamId === playerId
  );

  const selectPlayer = (p: MatchDetailPlayer) => {
    setSelectedKey(playerKey(p));
    requestAnimationFrame(() => {
      inspectRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };

  const activeKey = selectedPlayer ? playerKey(selectedPlayer) : selectedKey;

  const scoreboardBlocks = useMemo(() => {
    if (!viewModel) return null;
    if (
      viewModel.teamsResolved &&
      (viewModel.winningTeam.length > 0 || viewModel.losingTeam.length > 0)
    ) {
      return (
        <div className="space-y-3">
          <ScoreboardTable
            players={viewModel.winningTeam}
            selectedKey={activeKey}
            title="Winning team"
            badge="win"
            teamAvg={viewModel.winningTeamAvg}
            platform={viewModel.platform}
            onSelectPlayer={selectPlayer}
          />
          <ScoreboardTable
            players={viewModel.losingTeam}
            selectedKey={activeKey}
            title="Losing team"
            badge="lose"
            teamAvg={viewModel.losingTeamAvg}
            platform={viewModel.platform}
            onSelectPlayer={selectPlayer}
          />
        </div>
      );
    }
    if (viewModel.players.length > 1) {
      return (
        <ScoreboardTable
          players={viewModel.players}
          selectedKey={activeKey}
          title="Scoreboard"
          platform={viewModel.platform}
          onSelectPlayer={selectPlayer}
        />
      );
    }
    if (viewModel.players.length === 1) {
      return (
        <ScoreboardTable
          players={viewModel.players}
          selectedKey={activeKey}
          title="Player stats"
          platform={viewModel.platform}
          onSelectPlayer={selectPlayer}
        />
      );
    }
    return null;
  }, [viewModel, activeKey]);

  const showPremierUploadCta =
    viewModel?.platform === "premier" &&
    (viewModel.status === "not_found" ||
      viewModel.status === "pending" ||
      viewModel.status === "error" ||
      (viewModel.status === "partial" && viewModel.players.length === 0));

  const aimPremier =
    selectedPlayer?.steamId === playerId
      ? selectedPlayer.premierRating ?? ownerPremier
      : selectedPlayer?.premierRating ?? null;
  const aimFaceitElo =
    selectedPlayer?.faceitElo ??
    (selectedPlayer?.steamId === playerId ? ownerFaceitElo : null);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 mt-16">
      <div className="mb-4">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <HiArrowLeft className="size-4" aria-hidden />
          Back to profile
        </Link>
      </div>

      {loading ? (
        <MatchDetailSkeleton />
      ) : viewModel ? (
        <div className="space-y-5">
          <MatchHero model={viewModel} when={when} />
          <StatusBanner model={viewModel} />
          {viewModel.players.length > 1 ? (
            <TopPerformers players={viewModel.players} />
          ) : null}
          {viewModel.players.length > 1 ? (
            <p className="text-[11px] text-muted-foreground -mt-2">
              Click a player on the scoreboard to inspect their performance and Neok AI for this demo.
            </p>
          ) : null}
          {selectedPlayer ? (
            <div ref={inspectRef} className="space-y-5">
              <section className="space-y-2.5">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {selectedIsProfileOwner
                    ? "Your performance"
                    : `Performance · ${selectedPlayer.faceitNickname || selectedPlayer.name}`}
                </h2>
                <FocusStrip focus={selectedPlayer} />
              </section>
              <MatchAimIntegrity
                focus={selectedPlayer}
                platform={viewModel.platform}
                premierRating={aimPremier}
                faceitElo={aimFaceitElo}
              />
            </div>
          ) : null}
          {scoreboardBlocks}
          {showPremierUploadCta ? (
            <PremierUploadCta shareCode={viewModel.matchId} status={viewModel.status} />
          ) : null}
          {viewModel.status === "not_found" &&
          !viewModel.focus &&
          viewModel.platform !== "premier" ? (
            <p className="text-sm text-muted-foreground">
              Open a FACEIT match that has a parsed demo to see the full lobby scoreboard.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
