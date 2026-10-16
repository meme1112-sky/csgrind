"use client";

import Image from "next/image";
import type { LeetifyDisplay } from "@/lib/leetifyProfile";
import {
  premierBracketLabel,
  premierBracketPalette,
  isUnrankedPremier,
  formatSignedLeetifyRank,
  leetifyRankToneClass,
} from "@/lib/leetifyRatingBenchmarks";
import { PremierRatingBadge } from "@/components/premier-rating-badge";

function StatTile({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-border/80 bg-muted/20 px-3 py-4 text-center min-h-[104px] ${className}`}
    >
      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function DataListCard({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string; valueClass?: string }[];
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-muted/20 p-4 min-h-[140px]">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{r.label}</span>
            <span
              className={`font-semibold tabular-nums shrink-0 ${r.valueClass ?? "text-foreground"}`}
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PremierChevron({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 17 32" className={className} aria-hidden fill="currentColor">
      <path d="M5.44 2.13A2.6 2.6 0 0 1 7.99 0h1.86a.6.6 0 0 1 .6.7L4.83 31.5a.6.6 0 0 1-.6.5h-2.3c-1 0-1.76-.9-1.58-1.89l5.1-27.98ZM11.82.99c.1-.57.6-.99 1.18-.99h2.93a.6.6 0 0 1 .59.7l-5.4 30.31c-.1.57-.6.99-1.18.99H7a.6.6 0 0 1-.59-.7L11.82.98Z" />
    </svg>
  );
}

function PremierBracketBadge({
  label,
  display,
}: {
  label: string;
  display: string;
}) {
  const palette = premierBracketPalette(label);

  return (
    <span
      className="inline-flex h-7 items-stretch overflow-hidden border text-[12px] font-bold italic leading-none shadow-sm"
      style={{
        backgroundColor: palette.bg,
        borderColor: palette.border,
        color: palette.border,
        transform: "skewX(-14deg)",
      }}
    >
      <span className="flex items-center pl-1.5 pr-0.5" aria-hidden>
        <PremierChevron className="h-[18px] w-[9px]" />
      </span>
      <span
        className="flex items-center justify-center px-2.5 tabular-nums tracking-wide"
        style={{ color: palette.text }}
      >
        {display}
      </span>
    </span>
  );
}

function TrendArrow({ trend }: { trend: "up" | "down" | "even" }) {
  if (trend === "even") return null;
  const up = trend === "up";
  return (
    <svg
      viewBox="0 0 10 10"
      className={`size-2.5 shrink-0 ${up ? "text-emerald-400" : "text-orange-400"}`}
      fill="currentColor"
      aria-hidden
    >
      {up ? <path d="M5 1.2 9.3 8.8H.7L5 1.2Z" /> : <path d="M5 8.8 9.3 1.2H.7L5 8.8Z" />}
    </svg>
  );
}

/** Leetify-style skill fill: deep rose → magenta → light pink. */
const SKILL_BAR_GRADIENT =
  "linear-gradient(90deg, #9d174d 0%, #db2777 48%, #f9a8d4 100%)";

function LeetifyRatingRow({
  label,
  display,
  fillPct,
  indicatorPct,
  comparison,
  trend,
  isLast = false,
}: {
  label: string;
  display: string;
  fillPct: number;
  indicatorPct: number;
  comparison: string;
  trend: "up" | "down" | "even";
  isLast?: boolean;
}) {
  const indicatorLeft = Math.max(1.5, Math.min(98.5, indicatorPct));
  const trendLabel =
    trend === "up" ? "above average" : trend === "down" ? "below average" : "at average";

  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_2.85rem] items-stretch gap-x-2${isLast ? " pb-[15px]" : ""}`}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </span>
          <span
            className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums text-foreground text-xs"
            title={`${label} ${display} (${trendLabel})`}
          >
            {display}
            <TrendArrow trend={trend} />
          </span>
        </div>
        <div className="relative h-2.5 overflow-visible">
          <div className="absolute inset-0 rounded-sm bg-zinc-800/90" aria-hidden />
          {fillPct > 0 && (
            <div
              className="absolute inset-y-0 left-0 rounded-sm shadow-[0_0_10px_rgba(219,39,119,0.28)] transition-[width] duration-500 ease-out"
              style={{ width: `${fillPct}%`, backgroundImage: SKILL_BAR_GRADIENT }}
              role="progressbar"
              aria-valuenow={fillPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${label} ${display}, ${trendLabel}`}
            />
          )}
          <div
            className="pointer-events-none absolute z-10 w-px -translate-x-1/2 rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.45),0_0_6px_rgba(255,255,255,0.85)]"
            style={{ left: `${indicatorLeft}%`, top: "-3px", bottom: "-3px" }}
            title="Bracket benchmark"
            aria-hidden
          />
        </div>
      </div>
      <div className="flex items-center justify-center mt-[15px]">
        <span className="text-center text-[13px] font-semibold tabular-nums text-zinc-200 text-xs">
          {comparison}
        </span>
      </div>
    </div>
  );
}

function LeetifyRatingBars({
  bars,
  premier,
  premierFormatted,
}: {
  bars: LeetifyDisplay["ratingBars"];
  premier: number | null;
  premierFormatted: string;
}) {
  const unranked = isUnrankedPremier(premier);
  const bracketLabel = premierBracketLabel(premier);
  const badgeDisplay = unranked ? "Unranked" : premierFormatted;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border/80 bg-muted/20 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">Skill ratings</h3>
        <PremierBracketBadge label={bracketLabel} display={badgeDisplay} />
      </div>
      <div className="relative flex flex-col gap-4">
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-12 rounded-md bg-black/55"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4">
          {bars.map((bar, index) => (
            <LeetifyRatingRow
              key={bar.label}
              {...bar}
              isLast={index === bars.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FormSquare({ result, index }: { result: "W" | "L"; index: number }) {
  return (
    <span
      title={`Match ${index + 1}: ${result === "W" ? "Win" : "Loss"}`}
      className={`flex size-8 items-center justify-center rounded text-xs font-bold ${
        result === "W" ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/25 text-rose-400"
      }`}
    >
      {result}
    </span>
  );
}

function LeetifyLoadedContent({ data }: { data: LeetifyDisplay }) {
  const isPrivate = data.privacyMode !== "public";
  const form = data.wlHistory;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatTile label="Rating">
          <span
            className={`text-2xl font-bold tabular-nums ${leetifyRankToneClass(data.leetifyRank)}`}
          >
            {formatSignedLeetifyRank(data.leetifyRank)}
          </span>
        </StatTile>

        <StatTile label="Premier">
          <div className="flex justify-center">
            <PremierRatingBadge rating={data.premier} height={36} size="md" />
          </div>
        </StatTile>

        <StatTile label="Win rate">
          <span className="text-2xl font-bold tabular-nums">{data.winrate}</span>
        </StatTile>

        <StatTile label="HS%">
          <span className="text-2xl font-bold tabular-nums">{data.stats.headshotAccuracy}</span>
        </StatTile>

        <StatTile label="Matches">
          <span className="text-2xl font-bold tabular-nums">
            {data.totalMatches > 0 ? data.totalMatches.toLocaleString("en-US") : "—"}
          </span>
        </StatTile>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <LeetifyRatingBars
          bars={data.ratingBars}
          premier={data.premier}
          premierFormatted={data.premierFormatted}
        />
        <DataListCard
          title="Lifetime stats"
          rows={[
            { label: "Accuracy", value: data.stats.accuracy },
            { label: "Headshot %", value: data.stats.headshotAccuracy },
            { label: "Preaim", value: data.stats.preaim },
            { label: "Reaction time", value: data.stats.reactionTime },
            { label: "Spray accuracy", value: data.stats.sprayAccuracy },
          ]}
        />
      </div>

      {form.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-muted/20 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">Recent form</h3>
            <span className="text-[11px] text-muted-foreground">
              Last {form.length} · from Leetify
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {form.map((r, i) => (
              <FormSquare key={i} result={r} index={i} />
            ))}
          </div>
        </div>
      )}

      {isPrivate && form.length === 0 && (
        <p className="text-sm text-muted-foreground">
          This profile is private on Leetify — match history and some stats may be hidden.
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-2 text-xs text-muted-foreground border-t border-border/60 pt-4">
        <span>First match: {data.firstMatch}</span>
        <span className="hidden sm:inline">·</span>
        <span>Last match: {data.lastMatch}</span>
      </div>
    </>
  );
}

export function LeetifyStatisticsSection({
  leetifyData,
  loading,
  error,
}: {
  leetifyData: LeetifyDisplay | null;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-card text-card-foreground shadow-sm overflow-hidden">
      <div className="border-b border-border/80 bg-muted/15 px-5 py-4 sm:px-6 border-b-emerald-500/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Image
              src="/images/svg/leetify.svg"
              alt=""
              width={24}
              height={24}
              className="hidden sm:block shrink-0 opacity-90"
            />
            <div className="min-w-0">
              <h2 className="text-base font-semibold leading-tight">Leetify CS2 Statistics</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Ratings and lifetime stats from Leetify
              </p>
            </div>
          </div>
          {leetifyData && (
            <a
              href={leetifyData.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-emerald-500 hover:underline truncate sm:text-right sm:max-w-[220px] transition-opacity hover:opacity-80"
            >
              {leetifyData.name}
            </a>
          )}
        </div>
      </div>

      <div className="p-5 sm:p-6 space-y-5">
        {loading && (
          <div className="flex items-center justify-center py-14 text-muted-foreground text-sm">
            Loading Leetify…
          </div>
        )}
        {!loading && error && !leetifyData && (
          <div className="flex flex-col items-center justify-center py-14 gap-2 text-muted-foreground text-sm">
            <span>No Leetify data</span>
            <a
              href="https://leetify.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-500 hover:underline"
            >
              View on Leetify
            </a>
          </div>
        )}
        {!loading && leetifyData && <LeetifyLoadedContent data={leetifyData} />}
      </div>
    </div>
  );
}
