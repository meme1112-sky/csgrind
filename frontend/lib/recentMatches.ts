/** Recent match rows for the profile sidebar (map · score · W/L · HLTV 2.0 rating). */

import type { AnalyticsBySteamMatch } from "@/lib/analyticsBySteam";

export type MatchOutcome = "W" | "L";

/** Sidebar filter: FACEIT lobby vs Valve Premier MM. */
export type MatchPlatform = "faceit" | "premier";

export type RecentMatchSource = {
  /** FACEIT / Valve match id when known (best join key for demo ratings). */
  matchId?: string | null;
  mapName?: string | null;
  /** Player team rounds first when known. */
  scoreUs?: number | null;
  scoreThem?: number | null;
  outcome?: MatchOutcome | null;
  finishedAt?: string | null;
  /** Known when from FACEIT history or Valve demos; unlabeled Leetify rows stay unset. */
  platform?: MatchPlatform | null;
  /** Leetify per-match rating (raw API value; typically ~±0.05). */
  leetifyRating?: number | null;
};

export type RecentMatchRow = {
  id: string;
  /** Real FACEIT / Valve id when known; null for synthetic list keys. */
  matchId: string | null;
  mapLabel: string;
  /** Normalized key used for map art lookup (e.g. "inferno"). */
  mapKey: string;
  scoreLabel: string | null;
  outcome: MatchOutcome | null;
  /** HLTV 2.0-style from parsed demos (FACEIT path). */
  rating: number | null;
  /** Leetify proprietary per-match rating (Premier path). */
  leetifyRating: number | null;
  finishedAt: string | null;
  platform: MatchPlatform | null;
};

/** Synthetic row keys from builders — not safe for `/match/[id]` navigation. */
const SYNTHETIC_MATCH_ID = /^(an|src|hist|faceit)-/;

/** Valve MM share codes used as match ids in our pipeline. */
export function isValveShareCode(id: string | null | undefined): boolean {
  const s = (id ?? "").trim().toUpperCase();
  return s.startsWith("CSGO-") && s.length >= 12;
}

/** True when `id` is a real match/share code suitable for a detail page. */
export function isNavigableMatchId(id: string | null | undefined): boolean {
  const s = (id ?? "").trim();
  if (!s) return false;
  if (SYNTHETIC_MATCH_ID.test(s)) return false;
  return true;
}

/** Profile/player match detail path. Premier rows without a navigable id should not call this. */
export function matchDetailHref(opts: {
  playerId: string;
  matchId: string;
  platform?: MatchPlatform | null;
  /** Default `player` (public search destination). */
  base?: "player" | "profile";
}): string {
  const q = new URLSearchParams();
  if (opts.platform === "faceit" || opts.platform === "premier") {
    q.set("platform", opts.platform);
  }
  const qs = q.toString();
  const root = opts.base === "profile" ? "profile" : "player";
  return `/${root}/${encodeURIComponent(opts.playerId)}/match/${encodeURIComponent(opts.matchId)}${
    qs ? `?${qs}` : ""
  }`;
}

export function analyticsSourceToPlatform(
  source: string | null | undefined
): MatchPlatform | null {
  const s = (source ?? "").trim().toLowerCase();
  if (s === "valve" || s === "premier" || s === "mm") return "premier";
  if (s === "faceit") return "faceit";
  return null;
}

const MAP_ALIASES: Record<string, string> = {
  inferno: "INFERNO",
  mirage: "MIRAGE",
  nuke: "NUKE",
  overpass: "OVERPASS",
  vertigo: "VERTIGO",
  ancient: "ANCIENT",
  anubis: "ANUBIS",
  dust2: "DUST II",
  dustii: "DUST II",
  train: "TRAIN",
  italy: "ITALY",
  office: "OFFICE",
  agency: "AGENCY",
  thera: "THERA",
  mill: "MILL",
  mills: "MILLS",
  dogtown: "DOGTOWN",
  basalt: "BASALT",
  edin: "EDIN",
  grail: "GRAIL",
  jura: "JURA",
};

/** File stem under /images/maps (Valve map icon / thumb naming). */
const MAP_ASSET_STEM: Record<string, string> = {
  inferno: "de_inferno",
  mirage: "de_mirage",
  nuke: "de_nuke",
  overpass: "de_overpass",
  vertigo: "de_vertigo",
  ancient: "de_ancient",
  anubis: "de_anubis",
  dust2: "de_dust2",
  dustii: "de_dust2",
  train: "de_train",
  office: "cs_office",
  agency: "cs_agency",
  thera: "de_thera",
  mill: "de_mills",
  mills: "de_mills",
  basalt: "de_basalt",
  edin: "de_edin",
  grail: "de_grail",
  jura: "de_jura",
};

/** Allow map+time joins across Leetify / FACEIT / demo clocks. */
const JOIN_WINDOW_MS = 24 * 60 * 60 * 1000;

export function normalizeMapKey(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .trim()
    .toLowerCase()
    .replace(/^de[_/\s-]+/, "")
    .replace(/^cs[_/\s-]+/, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function formatMapLabel(raw: string | null | undefined): string {
  const key = normalizeMapKey(raw);
  if (!key) return "UNKNOWN";
  if (MAP_ALIASES[key]) return MAP_ALIASES[key];
  return key.replace(/([a-z])([0-9])/g, "$1 $2").toUpperCase();
}

/** Local Valve-style map icon path for sidebar thumbs. */
export function mapImageSrc(raw: string | null | undefined): string | null {
  const key = normalizeMapKey(raw);
  const stem = MAP_ASSET_STEM[key];
  if (!stem) return null;
  return `/images/maps/${stem}.png`;
}

export function formatHltvRating(rating: number | null | undefined): string | null {
  if (rating == null || !Number.isFinite(rating)) return null;
  return rating.toFixed(2);
}

/** Leetify match rating as shown on Leetify (+2.12 style). */
export function formatLeetifyMatchRating(rating: number | null | undefined): string | null {
  if (rating == null || !Number.isFinite(rating)) return null;
  const scaled = rating * 100;
  const sign = scaled >= 0 ? "+" : "";
  return `${sign}${scaled.toFixed(2)}`;
}

/** Tailwind classes for HLTV-style rating emphasis. */
export function hltvRatingClassName(rating: number | null | undefined): string {
  if (rating == null || !Number.isFinite(rating)) return "text-muted-foreground";
  if (rating >= 1.15) return "text-emerald-400";
  if (rating >= 0.95) return "text-foreground";
  return "text-rose-400";
}

/** Tailwind classes for signed Leetify match rating. */
export function leetifyMatchRatingClassName(rating: number | null | undefined): string {
  if (rating == null || !Number.isFinite(rating)) return "text-muted-foreground";
  if (rating > 0.005) return "text-emerald-400";
  if (rating < -0.005) return "text-rose-400";
  return "text-foreground";
}

export function formatRelativeMatchTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = parseFinishedMs(iso);
  if (ms == null) return null;
  const diffMs = Date.now() - ms;
  if (diffMs < 0) return "Just now";
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function parseFinishedMs(isoOrUnix: string | number | null | undefined): number | null {
  if (isoOrUnix == null) return null;
  if (typeof isoOrUnix === "number" && Number.isFinite(isoOrUnix)) {
    return isoOrUnix < 1e12 ? isoOrUnix * 1000 : isoOrUnix;
  }
  const s = String(isoOrUnix).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return n < 1e12 ? n * 1000 : n;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function scoreLabel(us: number | null | undefined, them: number | null | undefined): string | null {
  if (us == null || them == null || !Number.isFinite(us) || !Number.isFinite(them)) return null;
  return `${Math.round(us)}-${Math.round(them)}`;
}

function sourceKey(s: RecentMatchSource, index: number): string {
  const mid = s.matchId?.trim();
  if (mid) return `id:${mid}`;
  return `fz:${normalizeMapKey(s.mapName)}|${s.scoreUs ?? ""}-${s.scoreThem ?? ""}|${s.finishedAt ?? ""}|${s.outcome ?? ""}|${index}`;
}

function fuzzyClose(
  a: { mapKey?: string; scoreUs?: number | null; scoreThem?: number | null; finishedMs?: number | null },
  b: { mapKey?: string; scoreUs?: number | null; scoreThem?: number | null; finishedMs?: number | null }
): number | null {
  if (a.mapKey && b.mapKey && a.mapKey !== b.mapKey) return null;
  if (
    a.scoreUs != null &&
    a.scoreThem != null &&
    b.scoreUs != null &&
    b.scoreThem != null &&
    (a.scoreUs !== b.scoreUs || a.scoreThem !== b.scoreThem)
  ) {
    return null;
  }
  if (a.finishedMs != null && b.finishedMs != null) {
    const delta = Math.abs(a.finishedMs - b.finishedMs);
    if (delta > JOIN_WINDOW_MS) return null;
    return delta;
  }
  // Map+score without time is weak — only accept if both have scores.
  if (
    a.mapKey &&
    a.mapKey === b.mapKey &&
    a.scoreUs != null &&
    a.scoreThem != null &&
    b.scoreUs != null &&
    b.scoreThem != null
  ) {
    return JOIN_WINDOW_MS;
  }
  return null;
}

/**
 * Prefer FACEIT when demos share match ids (accurate HLTV join).
 * Otherwise use Leetify for map/score and attach FACEIT match ids when possible.
 */
export function selectRecentMatchSources(opts: {
  leetify?: RecentMatchSource[] | null;
  faceit?: RecentMatchSource[] | null;
  analyticsMatches?: AnalyticsBySteamMatch[] | null;
}): RecentMatchSource[] {
  const leetify = opts.leetify ?? [];
  const faceit = opts.faceit ?? [];
  const analyticsIds = new Set(
    (opts.analyticsMatches ?? [])
      .map((m) => (typeof m.match_id === "string" ? m.match_id.trim() : ""))
      .filter(Boolean)
  );

  const faceitHits = faceit.filter((f) => {
    const id = f.matchId?.trim();
    return id && analyticsIds.has(id);
  }).length;

  if (faceitHits > 0 && faceit.length > 0) {
    return faceit.map((f) => {
      const tagged: RecentMatchSource = { ...f, platform: f.platform ?? "faceit" };
      if (tagged.mapName) return tagged;
      const mid = tagged.matchId?.trim();
      if (!mid) return tagged;
      const hit = (opts.analyticsMatches ?? []).find((m) => m.match_id === mid);
      return hit?.map ? { ...tagged, mapName: hit.map } : tagged;
    });
  }

  if (leetify.length > 0) {
    return attachFaceitIds(leetify, faceit);
  }
  return enrichFaceitSources(faceit, { analyticsMatches: opts.analyticsMatches });
}

/**
 * FACEIT history is the list of record (newest first). Fill missing maps from
 * parsed demos and Leetify FACEIT matches — the Data API history payload has no map.
 */
export function enrichFaceitSources(
  faceit: RecentMatchSource[] | null | undefined,
  extras?: {
    leetify?: RecentMatchSource[] | null;
    analyticsMatches?: AnalyticsBySteamMatch[] | null;
  }
): RecentMatchSource[] {
  const list = (faceit ?? []).map((f) => ({ ...f, platform: (f.platform ?? "faceit") as MatchPlatform }));
  if (list.length === 0) return list;

  const analyticsById = new Map<string, string>();
  for (const m of extras?.analyticsMatches ?? []) {
    const id = typeof m.match_id === "string" ? m.match_id.trim() : "";
    const map = typeof m.map === "string" ? m.map.trim() : "";
    if (id && map) analyticsById.set(id, map);
  }

  const leetifyFaceit = (extras?.leetify ?? []).filter(
    (m) => m.platform === "faceit" || m.platform == null
  );
  const usedLeetify = new Set<number>();

  return list.map((f) => {
    if (f.mapName) return f;
    const mid = f.matchId?.trim();
    if (mid && analyticsById.has(mid)) {
      return { ...f, mapName: analyticsById.get(mid) ?? null };
    }

    const fms = parseFinishedMs(f.finishedAt ?? null);
    let bestIdx = -1;
    let bestDelta = Infinity;
    leetifyFaceit.forEach((L, i) => {
      if (usedLeetify.has(i) || !L.mapName) return;
      if (f.scoreUs == null || f.scoreThem == null) return;
      if (L.scoreUs !== f.scoreUs || L.scoreThem !== f.scoreThem) return;
      const Lms = parseFinishedMs(L.finishedAt ?? null);
      if (fms == null || Lms == null) return;
      const delta = Math.abs(fms - Lms);
      if (delta > JOIN_WINDOW_MS) return;
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIdx = i;
      }
    });
    if (bestIdx < 0) return f;
    usedLeetify.add(bestIdx);
    const L = leetifyFaceit[bestIdx]!;
    return {
      ...f,
      mapName: L.mapName,
      leetifyRating: f.leetifyRating ?? L.leetifyRating ?? null,
    };
  });
}

/**
 * FACEIT chip: only matches with a parsed demo (HLTV). Skip history-only rows.
 */
export function buildFaceitHistoryRows(opts: {
  sources?: RecentMatchSource[] | null;
  analyticsMatches?: AnalyticsBySteamMatch[] | null;
  limit?: number;
}): RecentMatchRow[] {
  const limit = opts.limit ?? 5;
  const sources = enrichFaceitSources(opts.sources, { analyticsMatches: opts.analyticsMatches }).filter(
    (s) => s.mapName || (s.scoreUs != null && s.scoreThem != null) || s.matchId || s.outcome
  );
  const analyticsMatches = (opts.analyticsMatches ?? []).filter(
    (m) => analyticsSourceToPlatform(m.source) !== "premier"
  );
  const candidates = toRatingCandidates(analyticsMatches);
  const rows: RecentMatchRow[] = [];

  for (let i = 0; i < sources.length; i++) {
    if (rows.length >= limit) break;
    const s = sources[i]!;
    const mid = s.matchId?.trim() || null;
    let rating: number | null = null;
    if (mid) {
      const hit = candidates.find((c) => !c.used && c.matchId === mid && c.rating != null);
      if (hit) {
        hit.used = true;
        rating = hit.rating;
      }
    }
    if (rating == null) {
      const mapKey = normalizeMapKey(s.mapName);
      const finishedMs = parseFinishedMs(s.finishedAt ?? null);
      let best: (typeof candidates)[number] | null = null;
      let bestDelta = Infinity;
      for (const c of candidates) {
        if (c.used || c.rating == null) continue;
        const delta = fuzzyClose(
          { mapKey: mapKey || undefined, scoreUs: s.scoreUs, scoreThem: s.scoreThem, finishedMs },
          { mapKey: c.mapKey || undefined, finishedMs: c.playedMs }
        );
        if (delta == null) continue;
        if (mapKey && c.mapKey && c.mapKey !== mapKey) continue;
        if (delta < bestDelta) {
          best = c;
          bestDelta = delta;
        }
      }
      if (best) {
        best.used = true;
        rating = best.rating;
      }
    }
    if (rating == null) continue;

    let mapRaw = s.mapName ?? null;
    if (!mapRaw && mid) {
      const hit = analyticsMatches.find((m) => m.match_id === mid);
      mapRaw = hit?.map ?? null;
    }

    rows.push({
      id: mid || `faceit-${i}-${s.finishedAt ?? ""}-${formatMapLabel(mapRaw)}`,
      matchId: mid,
      mapLabel: formatMapLabel(mapRaw),
      mapKey: normalizeMapKey(mapRaw),
      scoreLabel: scoreLabel(s.scoreUs, s.scoreThem),
      outcome: s.outcome ?? null,
      rating,
      leetifyRating: s.leetifyRating ?? null,
      finishedAt: s.finishedAt ?? null,
      platform: "faceit",
    });
  }

  return rows;
}

function attachFaceitIds(
  leetify: RecentMatchSource[],
  faceit: RecentMatchSource[]
): RecentMatchSource[] {
  const usedFaceit = new Set<number>();
  return leetify.map((L) => {
    if (L.matchId?.trim()) return L;
    const Lms = parseFinishedMs(L.finishedAt ?? null);
    const Lmap = normalizeMapKey(L.mapName);
    let bestIdx = -1;
    let bestDelta = Infinity;
    faceit.forEach((F, i) => {
      if (usedFaceit.has(i) || !F.matchId?.trim()) return;
      const delta = fuzzyClose(
        { mapKey: Lmap || undefined, scoreUs: L.scoreUs, scoreThem: L.scoreThem, finishedMs: Lms },
        {
          mapKey: normalizeMapKey(F.mapName) || undefined,
          scoreUs: F.scoreUs,
          scoreThem: F.scoreThem,
          finishedMs: parseFinishedMs(F.finishedAt ?? null),
        }
      );
      // FACEIT often lacks map — allow score+time only.
      let d = delta;
      if (d == null && Lms != null && F.scoreUs != null && F.scoreThem != null) {
        const Fms = parseFinishedMs(F.finishedAt ?? null);
        if (
          Fms != null &&
          L.scoreUs === F.scoreUs &&
          L.scoreThem === F.scoreThem &&
          Math.abs(Lms - Fms) <= JOIN_WINDOW_MS
        ) {
          d = Math.abs(Lms - Fms);
        }
      }
      if (d != null && d < bestDelta) {
        bestDelta = d;
        bestIdx = i;
      }
    });
    if (bestIdx < 0) return L;
    usedFaceit.add(bestIdx);
    const F = faceit[bestIdx]!;
    return {
      ...L,
      matchId: F.matchId,
      mapName: L.mapName || F.mapName,
      platform: "faceit",
    };
  });
}

type RatingCandidate = {
  match: AnalyticsBySteamMatch;
  matchId: string | null;
  mapKey: string;
  playedMs: number | null;
  rating: number | null;
  used: boolean;
};

function toRatingCandidates(matches: AnalyticsBySteamMatch[] | null | undefined): RatingCandidate[] {
  return (matches ?? []).map((m) => ({
    match: m,
    matchId: typeof m.match_id === "string" && m.match_id.trim() ? m.match_id.trim() : null,
    mapKey: normalizeMapKey(m.map ?? null),
    playedMs: parseFinishedMs(m.played_at ?? null),
    rating:
      m.panels?.combat?.rating != null && Number.isFinite(m.panels.combat.rating)
        ? m.panels.combat.rating
        : null,
    used: false,
  }));
}

function findSourceForAnalytics(
  sources: RecentMatchSource[],
  used: Set<string>,
  c: RatingCandidate
): RecentMatchSource | null {
  if (c.matchId) {
    const byId = sources.findIndex((s, i) => !used.has(sourceKey(s, i)) && s.matchId?.trim() === c.matchId);
    if (byId >= 0) {
      used.add(sourceKey(sources[byId]!, byId));
      return sources[byId]!;
    }
  }

  let bestSource: RecentMatchSource | null = null;
  let bestIndex = -1;
  let bestDelta = Infinity;
  sources.forEach((s, i) => {
    if (used.has(sourceKey(s, i))) return;
    const delta = fuzzyClose(
      {
        mapKey: c.mapKey || undefined,
        finishedMs: c.playedMs,
      },
      {
        mapKey: normalizeMapKey(s.mapName) || undefined,
        scoreUs: s.scoreUs,
        scoreThem: s.scoreThem,
        finishedMs: parseFinishedMs(s.finishedAt ?? null),
      }
    );
    if (delta == null) return;
    // Require map match when joining without match id.
    if (c.mapKey && normalizeMapKey(s.mapName) !== c.mapKey) return;
    if (delta < bestDelta) {
      bestSource = s;
      bestIndex = i;
      bestDelta = delta;
    }
  });
  if (bestSource && bestIndex >= 0) {
    used.add(sourceKey(bestSource, bestIndex));
    return bestSource;
  }
  return null;
}

/**
 * Analytics (parsed demos) first — now includes score/W-L from FACEIT match_meta.
 * External history only fills gaps when demos are sparse.
 */
function rowPlatform(
  analyticsSource: string | null | undefined,
  src: RecentMatchSource | null | undefined
): MatchPlatform | null {
  return analyticsSourceToPlatform(analyticsSource) ?? src?.platform ?? null;
}

function matchesPlatformFilter(
  platform: MatchPlatform | null,
  filter: MatchPlatform | null | undefined
): boolean {
  if (!filter) return true;
  return platform === filter;
}

export function buildRecentMatchRows(opts: {
  sources?: RecentMatchSource[] | null;
  analyticsMatches?: AnalyticsBySteamMatch[] | null;
  limit?: number;
  /** When set, only FACEIT or Premier rows are built (before the display cap). */
  platform?: MatchPlatform | null;
}): RecentMatchRow[] {
  const limit = opts.limit ?? 5;
  const filter = opts.platform ?? null;
  const sources = (opts.sources ?? []).filter((s) => {
    if (!(s.mapName || (s.scoreUs != null && s.scoreThem != null) || s.matchId || s.outcome)) {
      return false;
    }
    return matchesPlatformFilter(s.platform ?? null, filter);
  });
  const analyticsMatches = (opts.analyticsMatches ?? []).filter((m) =>
    matchesPlatformFilter(analyticsSourceToPlatform(m.source), filter)
  );
  const candidates = toRatingCandidates(analyticsMatches);
  const usedSources = new Set<string>();
  const rows: RecentMatchRow[] = [];

  const parseOutcome = (raw: unknown): MatchOutcome | null => {
    const o = String(raw ?? "").trim().toUpperCase();
    return o === "W" || o === "L" ? o : null;
  };

  const ordered = [...candidates].sort((a, b) => (b.playedMs ?? 0) - (a.playedMs ?? 0));

  for (const c of ordered) {
    if (rows.length >= limit) break;
    c.used = true;
    const m = c.match;
    const src = findSourceForAnalytics(sources, usedSources, c);
    const mapRaw = m.map || src?.mapName || null;
    const scoreUs = m.score_us ?? src?.scoreUs ?? null;
    const scoreThem = m.score_them ?? src?.scoreThem ?? null;
    const outcome = parseOutcome(m.outcome) ?? src?.outcome ?? null;
    rows.push({
      id: c.matchId || `an-${m.played_at ?? ""}-${m.map ?? ""}-${rows.length}`,
      matchId: c.matchId,
      mapLabel: formatMapLabel(mapRaw),
      mapKey: normalizeMapKey(mapRaw),
      scoreLabel: scoreLabel(scoreUs, scoreThem),
      outcome,
      rating: c.rating,
      leetifyRating: src?.leetifyRating ?? null,
      finishedAt: m.played_at ?? src?.finishedAt ?? null,
      platform: rowPlatform(m.source, src),
    });
  }

  for (let i = 0; i < sources.length; i++) {
    if (rows.length >= limit) break;
    const s = sources[i]!;
    const key = sourceKey(s, i);
    if (usedSources.has(key)) continue;
    usedSources.add(key);

    let rating: number | null = null;
    const mid = s.matchId?.trim() || null;
    if (mid) {
      const hit = candidates.find((c) => !c.used && c.matchId === mid && c.rating != null);
      if (hit) {
        hit.used = true;
        rating = hit.rating;
      }
    }
    if (rating == null) {
      const mapKey = normalizeMapKey(s.mapName);
      const finishedMs = parseFinishedMs(s.finishedAt ?? null);
      let best: RatingCandidate | null = null;
      let bestDelta = Infinity;
      for (const c of candidates) {
        if (c.used || c.rating == null) continue;
        const delta = fuzzyClose(
          { mapKey: mapKey || undefined, scoreUs: s.scoreUs, scoreThem: s.scoreThem, finishedMs },
          { mapKey: c.mapKey || undefined, finishedMs: c.playedMs }
        );
        if (delta == null) continue;
        if (mapKey && c.mapKey !== mapKey) continue;
        if (delta < bestDelta) {
          best = c;
          bestDelta = delta;
        }
      }
      if (best) {
        best.used = true;
        rating = best.rating;
      }
    }

    let mapRaw = s.mapName ?? null;
    if (!mapRaw && mid) {
      const hit = analyticsMatches.find((m) => m.match_id === mid);
      mapRaw = hit?.map ?? null;
    }

    rows.push({
      id: mid || `src-${i}-${s.finishedAt ?? ""}-${formatMapLabel(mapRaw)}`,
      matchId: mid,
      mapLabel: formatMapLabel(mapRaw),
      mapKey: normalizeMapKey(mapRaw),
      scoreLabel: scoreLabel(s.scoreUs, s.scoreThem),
      outcome: s.outcome ?? null,
      rating,
      leetifyRating: s.leetifyRating ?? null,
      finishedAt: s.finishedAt ?? null,
      platform: s.platform ?? (mid ? analyticsSourceToPlatform(
        analyticsMatches.find((m) => m.match_id === mid)?.source
      ) : null),
    });
  }

  return rows;
}

/**
 * Display-only history rows (e.g. Leetify Premier) — Leetify rating, not demo HLTV.
 */
export function buildHistoryOnlyRows(
  sources: RecentMatchSource[] | null | undefined,
  opts?: { limit?: number; platform?: MatchPlatform | null }
): RecentMatchRow[] {
  const limit = opts?.limit ?? 5;
  const filter = opts?.platform ?? null;
  return (sources ?? [])
    .filter((s) => {
      if (!(s.mapName || (s.scoreUs != null && s.scoreThem != null) || s.outcome)) return false;
      return matchesPlatformFilter(s.platform ?? null, filter);
    })
    .slice(0, limit)
    .map((s, i) => {
      const mid = s.matchId?.trim() || null;
      return {
        id: mid || `hist-${i}-${s.finishedAt ?? ""}-${formatMapLabel(s.mapName)}`,
        matchId: mid,
        mapLabel: formatMapLabel(s.mapName),
        mapKey: normalizeMapKey(s.mapName),
        scoreLabel: scoreLabel(s.scoreUs, s.scoreThem),
        outcome: s.outcome ?? null,
        rating: null,
        leetifyRating:
          s.leetifyRating != null && Number.isFinite(s.leetifyRating) ? s.leetifyRating : null,
        finishedAt: s.finishedAt ?? null,
        platform: s.platform ?? filter,
      };
    });
}

/** Wider window: Valve played_at is often parse/sync time, not match end. */
const PREMIER_VALVE_JOIN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Premier list: Leetify history for browsing + Valve share-code clickthrough when we
 * already parsed that lobby (own link or teammate coverage).
 */
export function buildPremierRows(opts: {
  sources?: RecentMatchSource[] | null;
  analyticsMatches?: AnalyticsBySteamMatch[] | null;
  limit?: number;
}): RecentMatchRow[] {
  const limit = opts.limit ?? 30;
  const history = (opts.sources ?? []).filter(
    (s) =>
      (s.platform == null || s.platform === "premier") &&
      (s.mapName || (s.scoreUs != null && s.scoreThem != null) || s.outcome)
  );
  const valveMatches = (opts.analyticsMatches ?? []).filter(
    (m) => analyticsSourceToPlatform(m.source) === "premier" && isValveShareCode(m.match_id)
  );

  type ValveCand = {
    match: AnalyticsBySteamMatch;
    shareCode: string;
    mapKey: string;
    playedMs: number | null;
    rating: number | null;
    used: boolean;
  };

  const candidates: ValveCand[] = valveMatches.map((m) => ({
    match: m,
    // Preserve Valve share-code case — CSGO-… codes are case-sensitive.
    shareCode: (m.match_id ?? "").trim(),
    mapKey: normalizeMapKey(m.map),
    playedMs: parseFinishedMs(m.played_at ?? null),
    rating:
      m.panels?.combat?.rating != null && Number.isFinite(m.panels.combat.rating)
        ? m.panels.combat.rating
        : null,
    used: false,
  }));

  const rows: RecentMatchRow[] = [];

  for (let i = 0; i < history.length; i++) {
    if (rows.length >= limit) break;
    const s = history[i]!;
    const mapKey = normalizeMapKey(s.mapName);
    const finishedMs = parseFinishedMs(s.finishedAt ?? null);

    let hit: ValveCand | null = null;
    let bestDelta = Infinity;
    for (const c of candidates) {
      if (c.used) continue;
      if (mapKey && c.mapKey && mapKey !== c.mapKey) continue;
      if (!mapKey && !c.mapKey) continue;
      if (finishedMs != null && c.playedMs != null) {
        const delta = Math.abs(finishedMs - c.playedMs);
        if (delta > PREMIER_VALVE_JOIN_MS) continue;
        if (delta < bestDelta) {
          bestDelta = delta;
          hit = c;
        }
        continue;
      }
      // Map-only fallback when clocks disagree badly (parse time vs finish time).
      if (mapKey && c.mapKey === mapKey && hit == null) {
        hit = c;
        bestDelta = PREMIER_VALVE_JOIN_MS;
      }
    }

    if (hit) hit.used = true;
    const mid = hit?.shareCode || s.matchId?.trim() || null;

    rows.push({
      id: mid || `hist-${i}-${s.finishedAt ?? ""}-${formatMapLabel(s.mapName)}`,
      matchId: mid,
      mapLabel: formatMapLabel(s.mapName || hit?.match.map),
      mapKey: mapKey || hit?.mapKey || "",
      scoreLabel: scoreLabel(s.scoreUs, s.scoreThem),
      outcome: s.outcome ?? null,
      rating: hit?.rating ?? null,
      leetifyRating:
        s.leetifyRating != null && Number.isFinite(s.leetifyRating) ? s.leetifyRating : null,
      finishedAt: s.finishedAt ?? hit?.match.played_at ?? null,
      platform: "premier",
    });
  }

  // Parsed Valve lobbies not present in Leetify history (coverage / linked-only).
  const leftover = [...candidates]
    .filter((c) => !c.used)
    .sort((a, b) => (b.playedMs ?? 0) - (a.playedMs ?? 0));

  for (const c of leftover) {
    if (rows.length >= limit) break;
    const m = c.match;
    rows.push({
      id: c.shareCode,
      matchId: c.shareCode,
      mapLabel: formatMapLabel(m.map),
      mapKey: c.mapKey,
      scoreLabel: scoreLabel(m.score_us, m.score_them),
      outcome:
        m.outcome === "W" || m.outcome === "L"
          ? m.outcome
          : null,
      rating: c.rating,
      leetifyRating: null,
      finishedAt: m.played_at ?? null,
      platform: "premier",
    });
  }

  return rows;
}
