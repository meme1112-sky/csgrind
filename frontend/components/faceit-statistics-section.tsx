"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { HiChevronDown } from "react-icons/hi2";
import type { FaceitDisplay, FaceitGame, FaceitGamesAvailable } from "@/lib/faceitLifetime";
import { faceitLevelBadgePath, faceitLevelColor } from "@/lib/premierBadges";

function FaceitStatTile({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-border/80 bg-muted/20 px-3 py-4 text-center min-h-[104px] ${className}`}
    >
      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
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
            <span className={`font-semibold tabular-nums shrink-0 ${r.valueClass ?? "text-foreground"}`}>{r.value}</span>
          </div>
        ))}
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

function hasFaceitStat(value: string | null | undefined): boolean {
  return !!value && value !== "—";
}

function FaceitLoadedContent({ faceitData }: { faceitData: FaceitDisplay }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const ex = faceitData.extended;
  const wl = faceitData.wlHistory.filter((r): r is "W" | "L" => r === "W" || r === "L");
  const level = faceitData.level;
  const levelColor = faceitLevelColor(level);
  const levelBadge = faceitLevelBadgePath(level);

  const combatRows = [
    { label: "ADR", value: ex.adr },
    { label: "Sniper kills", value: ex.sniperKills },
  ].filter((r) => hasFaceitStat(r.value));

  const clutchRows = [
    { label: "1v1 win rate", value: ex.clutch1v1, valueClass: "text-emerald-400" },
    { label: "1v2 win rate", value: ex.clutch1v2, valueClass: "text-emerald-400" },
  ].filter((r) => hasFaceitStat(r.value));

  const utilityRows = [
    { label: "Flashes / round", value: ex.flashesPerRound },
    { label: "Utility / round", value: ex.utilityPerRound },
    { label: "Flash success", value: ex.flashSuccess },
    { label: "Utility success", value: ex.utilitySuccess },
    { label: "Total flashes", value: ex.totalFlashes },
    { label: "Total utility", value: ex.totalUtility },
  ].filter((r) => hasFaceitStat(r.value));

  const entryRows = [
    { label: "Entry rate", value: ex.entryRate },
    { label: "Entry success", value: ex.entrySuccess },
    { label: "Total entries", value: ex.totalEntries },
  ].filter((r) => hasFaceitStat(r.value));

  const additionalRows = [
    { label: "Total damage", value: ex.totalDamage },
    { label: "Total headshots", value: ex.totalHeadshotsCount },
    { label: "Total wins", value: ex.totalWins },
  ].filter((r) => hasFaceitStat(r.value));

  const hasAdvanced =
    utilityRows.length > 0 || entryRows.length > 0 || additionalRows.length > 0;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <FaceitStatTile label="Level">
          {level > 0 && levelBadge ? (
            <Image
              src={levelBadge}
              alt={`FACEIT level ${level}`}
              width={38}
              height={38}
              quality={100}
              unoptimized
              sizes="52px"
              className="size-[52px] object-contain [image-rendering:-webkit-optimize-contrast]"
            />
          ) : (
            <span className="text-xl font-bold text-muted-foreground tabular-nums">—</span>
          )}
        </FaceitStatTile>
        <FaceitStatTile label="ELO">
          <span className="text-2xl font-bold tabular-nums" style={{ color: levelColor }}>
            {faceitData.elo > 0 ? Math.round(faceitData.elo).toLocaleString("en-US") : "—"}
          </span>
        </FaceitStatTile>
        <FaceitStatTile label="Win rate">
          <span className="text-2xl font-bold text-emerald-400 tabular-nums">{faceitData.winrate}</span>
        </FaceitStatTile>
        <FaceitStatTile label="K/D">
          <span className="text-2xl font-bold text-foreground tabular-nums">{faceitData.kd}</span>
        </FaceitStatTile>
        <FaceitStatTile label="HS%">
          <span className="text-2xl font-bold text-foreground tabular-nums">{faceitData.headshots}</span>
        </FaceitStatTile>
        <FaceitStatTile label="Matches">
          <span className="text-2xl font-bold text-foreground tabular-nums">
            {faceitData.totalMatches > 0 ? faceitData.totalMatches.toLocaleString("en-US") : "—"}
          </span>
        </FaceitStatTile>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {combatRows.length > 0 && <DataListCard title="Combat stats" rows={combatRows} />}
        {clutchRows.length > 0 && <DataListCard title="Clutch performance" rows={clutchRows} />}
        <DataListCard
          title="Account info"
          rows={[
            { label: "Registered", value: faceitData.memberSinceShort },
            {
              label: "Total matches",
              value: faceitData.totalMatches > 0 ? faceitData.totalMatches.toLocaleString("en-US") : "—",
            },
          ].filter((r) => hasFaceitStat(r.value))}
        />
        <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-muted/20 p-4 min-h-[140px]">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">Recent form</h3>
            {wl.length > 0 ? (
              <span className="text-[11px] text-muted-foreground">
                Last {wl.length} · from FACEIT
              </span>
            ) : null}
          </div>
          {wl.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent matches</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {wl.map((r, i) => (
                <FormSquare key={i} result={r} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>

      {hasAdvanced && (
        <div className="rounded-xl border border-border/80 bg-muted/10 overflow-hidden">
          <button
            type="button"
            onClick={() => setAdvancedOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-muted/20 transition-colors"
            aria-expanded={advancedOpen}
          >
            <span className="flex items-center gap-2">
              <HiChevronDown
                className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${advancedOpen ? "rotate-180" : "rotate-0"}`}
              />
              {advancedOpen ? "Hide" : "Show"} advanced statistics
            </span>
          </button>
          {advancedOpen && (
            <div className="border-t border-border/80 px-4 pb-4 pt-2 space-y-4">
              {utilityRows.length > 0 && (
                <div className="rounded-lg border border-border/60 bg-background/40 p-4 space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Utility usage
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                    {utilityRows.map((r) => (
                      <div key={r.label} className="flex justify-between gap-3">
                        <span className="text-muted-foreground">{r.label}</span>
                        <span className="font-semibold tabular-nums">{r.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(entryRows.length > 0 || additionalRows.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {entryRows.length > 0 && (
                    <div className="rounded-lg border border-border/60 bg-background/40 p-4 space-y-2.5">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Entry stats
                      </h4>
                      {entryRows.map((r) => (
                        <div key={r.label} className="flex justify-between gap-3 text-sm">
                          <span className="text-muted-foreground">{r.label}</span>
                          <span className="font-semibold tabular-nums">{r.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {additionalRows.length > 0 && (
                    <div className="rounded-lg border border-border/60 bg-background/40 p-4 space-y-2.5">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Additional stats
                      </h4>
                      {additionalRows.map((r) => (
                        <div key={r.label} className="flex justify-between gap-3 text-sm">
                          <span className="text-muted-foreground">{r.label}</span>
                          <span className="font-semibold tabular-nums">{r.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 text-xs text-muted-foreground border-t border-border/60 pt-4">
        <span>Member since: {faceitData.memberSince}</span>
        <span className="hidden sm:inline">·</span>
        <span>Last match: {faceitData.lastMatch}</span>
      </div>
    </>
  );
}

export function FaceitStatisticsSection({
  faceitData,
  loading,
  error,
  game = "cs2",
  availableGames = { cs2: true, csgo: true },
  onGameChange,
}: {
  faceitData: FaceitDisplay | null;
  loading: boolean;
  error: string | null;
  game?: FaceitGame;
  availableGames?: FaceitGamesAvailable;
  onGameChange?: (game: FaceitGame) => void;
}) {
  const headerLevelColor = faceitLevelColor(faceitData?.level);
  const headerBadge = faceitData ? faceitLevelBadgePath(faceitData.level) : null;
  const gameLabel = game === "cs2" ? "CS2" : "CSGO";

  return (
    <div className="rounded-xl border border-border bg-card text-card-foreground shadow-sm overflow-hidden">
      <div
        className="border-b border-border/80 bg-muted/15 px-5 py-4 sm:px-6"
        style={
          faceitData && faceitData.level > 0
            ? { borderBottomColor: `${headerLevelColor}33` }
            : undefined
        }
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {headerBadge ? (
              <Image
                src={headerBadge}
                alt=""
                width={38}
                height={38}
                quality={100}
                unoptimized
                sizes="28px"
                className="hidden sm:block size-7 shrink-0 object-contain [image-rendering:-webkit-optimize-contrast]"
              />
            ) : (
              <span className="hidden sm:inline text-muted-foreground shrink-0">
                <Image src="/images/svg/faceit.svg" alt="" width={22} height={22} className="opacity-80" />
              </span>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold leading-tight">
                  FACEIT {gameLabel} Statistics
                </h2>
                {onGameChange && (
                  <div
                    role="group"
                    aria-label="FACEIT game"
                    className="inline-flex rounded-md border border-border bg-muted/40 p-0.5"
                  >
                    {(["cs2", "csgo"] as const).map((g) => {
                      const selected = game === g;
                      const enabled = availableGames[g] || selected;
                      return (
                        <button
                          key={g}
                          type="button"
                          disabled={!enabled || loading}
                          onClick={() => onGameChange(g)}
                          className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                            selected
                              ? "bg-background text-foreground shadow-sm"
                              : enabled
                                ? "text-muted-foreground hover:text-foreground"
                                : "cursor-not-allowed text-muted-foreground/40"
                          }`}
                          aria-pressed={selected}
                        >
                          {g === "cs2" ? "CS2" : "CSGO"}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                Lifetime stats from your FACEIT {gameLabel} profile
              </p>
            </div>
          </div>
          {faceitData && (
            <a
              href={faceitData.faceitProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold hover:underline truncate sm:text-right sm:max-w-[220px] transition-opacity hover:opacity-80"
              style={{ color: headerLevelColor }}
            >
              {faceitData.nickname}
            </a>
          )}
        </div>
      </div>

      <div className="p-5 sm:p-6 space-y-5">
        {loading && (
          <div className="flex items-center justify-center py-14 text-muted-foreground text-sm">
            Loading FACEIT {gameLabel}…
          </div>
        )}
        {!loading && error && !faceitData && (
          <div className="flex flex-col items-center justify-center py-14 gap-2 text-muted-foreground text-sm">
            <span>No FACEIT {gameLabel} data</span>
            <a href="https://www.faceit.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              View on FACEIT
            </a>
          </div>
        )}
        {!loading && faceitData && <FaceitLoadedContent faceitData={faceitData} />}
      </div>
    </div>
  );
}
