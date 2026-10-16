const express = require("express");
const faceitService = require("../services/faceit.service");
const config = require("../config");

const router = express.Router();

function requireFaceitKey(req, res, next) {
  if (!config.faceit.apiKey) {
    return res.status(500).json({ error: "FACEIT_KEY missing" });
  }
  next();
}

function sendFaceitJson(res, code, body) {
  res.set("Content-Type", "application/json");
  res.status(code || 500).send(body);
}

// GET /faceit/player?steam64=... | ?nickname=...
router.get("/player", requireFaceitKey, (req, res) => {
  const steam64 = req.query.steam64;
  const nickname = typeof req.query.nickname === "string" ? req.query.nickname.trim() : "";

  if (nickname) {
    const path = `/data/v4/players?nickname=${encodeURIComponent(nickname)}`;
    return faceitService.faceitGet(path, (code, body) => {
      sendFaceitJson(res, code === 200 ? 200 : code || 500, body || JSON.stringify({ error: "faceit not found" }));
    });
  }

  if (!steam64) {
    return res.status(400).json({ error: "steam64 or nickname required" });
  }

  const pathCs2 = `/data/v4/players?game=cs2&game_player_id=${encodeURIComponent(steam64)}`;
  faceitService.faceitGet(pathCs2, (code, body) => {
    if (code === 200) {
      res.set("Content-Type", "application/json");
      return res.status(200).send(body);
    }
    const pathCsgo = `/data/v4/players?game=csgo&game_player_id=${encodeURIComponent(steam64)}`;
    faceitService.faceitGet(pathCsgo, (code2, body2) => {
      res.set("Content-Type", "application/json");
      res.status(code2 === 200 ? 200 : code2 || 500).send(body2 || JSON.stringify({ error: "faceit not found" }));
    });
  });
});

// GET /faceit/stats?player_id=...&game=cs2|csgo
router.get("/stats", requireFaceitKey, (req, res) => {
  const playerId = req.query.player_id;
  const game = req.query.game || "cs2";
  if (!playerId) {
    return res.status(400).json({ error: "player_id required" });
  }

  const path = `/data/v4/players/${encodeURIComponent(playerId)}/stats/${game}`;
  faceitService.faceitGet(path, (code, body) => {
    if (code === 200) {
      res.set("Content-Type", "application/json");
      return res.status(200).send(body);
    }
    if (game === "cs2") {
      const pathCsgo = `/data/v4/players/${encodeURIComponent(playerId)}/stats/csgo`;
      faceitService.faceitGet(pathCsgo, (code2, body2) => {
        res.set("Content-Type", "application/json");
        res.status(code2 || 500).send(body2);
      });
    } else {
      res.set("Content-Type", "application/json");
      res.status(code).send(body);
    }
  });
});

// GET /faceit/matches?player_id=...&game=cs2|csgo&limit=30
// Per-match stats (includes Map) — history list does not.
router.get("/matches", requireFaceitKey, (req, res) => {
  const playerId = req.query.player_id;
  const game = req.query.game || "cs2";
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || "30", 10)));
  if (!playerId) {
    return res.status(400).json({ error: "player_id required" });
  }

  const path = `/data/v4/players/${encodeURIComponent(playerId)}/games/${encodeURIComponent(game)}/stats?offset=0&limit=${limit}`;
  faceitService.faceitGet(path, (code, body) => {
    res.set("Content-Type", "application/json");
    res.status(code || 500).send(body);
  });
});

// GET /faceit/history?player_id=...&game=...&limit=12
router.get("/history", requireFaceitKey, (req, res) => {
  const playerId = req.query.player_id;
  const game = req.query.game || "cs2";
  const limit = Math.max(1, Math.min(50, parseInt(req.query.limit || "12", 10)));
  if (!playerId) {
    return res.status(400).json({ error: "player_id required" });
  }

  const path = `/data/v4/players/${encodeURIComponent(playerId)}/history?game=${game}&offset=0&limit=${limit}`;
  faceitService.faceitGet(path, (code, body) => {
    res.set("Content-Type", "application/json");
    res.status(code || 500).send(body);
  });
});

// GET /faceit/match?match_id=... — single match detail (teams, score, map)
router.get("/match", requireFaceitKey, (req, res) => {
  const matchId = typeof req.query.match_id === "string" ? req.query.match_id.trim() : "";
  if (!matchId) {
    return res.status(400).json({ error: "match_id required" });
  }

  const path = `/data/v4/matches/${encodeURIComponent(matchId)}`;
  faceitService.faceitGet(path, (code, body) => {
    res.set("Content-Type", "application/json");
    res.status(code || 500).send(body);
  });
});

const ELO_CACHE_TTL_MS = 5 * 60 * 1000;
const ELO_CACHE_MAX = 2_000;
/** @type {Map<string, { elo: number|null, skillLevel: number|null, expiresAt: number }>} */
const eloCache = new Map();

function faceitGetAsync(path) {
  return new Promise((resolve) => {
    faceitService.faceitGet(path, (code, body) => resolve({ code, body }));
  });
}

function parsePlayerElo(body) {
  try {
    const data = typeof body === "string" ? JSON.parse(body) : body;
    if (!data || typeof data !== "object") return { elo: null, skillLevel: null };
    const games = data.games && typeof data.games === "object" ? data.games : {};
    const cs2 = games.cs2 && typeof games.cs2 === "object" ? games.cs2 : null;
    const csgo = games.csgo && typeof games.csgo === "object" ? games.csgo : null;
    const pick = cs2?.faceit_elo != null ? cs2 : csgo;
    if (!pick) return { elo: null, skillLevel: null };
    const eloRaw = Number(pick.faceit_elo);
    const levelRaw = Number(pick.skill_level);
    return {
      elo: Number.isFinite(eloRaw) && eloRaw > 0 ? Math.round(eloRaw) : null,
      skillLevel:
        Number.isFinite(levelRaw) && levelRaw >= 1 && levelRaw <= 10
          ? Math.round(levelRaw)
          : null,
    };
  } catch {
    return { elo: null, skillLevel: null };
  }
}

function cacheGet(playerId) {
  const hit = eloCache.get(playerId);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    eloCache.delete(playerId);
    return null;
  }
  return hit;
}

function cacheSet(playerId, value) {
  if (eloCache.size >= ELO_CACHE_MAX) {
    const first = eloCache.keys().next().value;
    if (first) eloCache.delete(first);
  }
  eloCache.set(playerId, {
    elo: value.elo,
    skillLevel: value.skillLevel,
    expiresAt: Date.now() + ELO_CACHE_TTL_MS,
  });
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  const n = Math.min(concurrency, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => run()));
  return results;
}

/**
 * GET /faceit/elos?player_ids=id1,id2,...
 * Current FACEIT Elo for up to 10 player IDs (lobby-sized batch).
 * Response: { elos: { [player_id]: { elo, skillLevel } } }
 */
router.get("/elos", requireFaceitKey, async (req, res) => {
  const raw = typeof req.query.player_ids === "string" ? req.query.player_ids : "";
  const ids = [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^[0-9a-f-]{8,64}$/i.test(s))
    ),
  ].slice(0, 10);

  if (ids.length === 0) {
    return res.status(400).json({ error: "player_ids required (comma-separated FACEIT UUIDs)" });
  }

  const elos = {};
  const missing = [];
  for (const id of ids) {
    const cached = cacheGet(id);
    if (cached) {
      elos[id] = { elo: cached.elo, skillLevel: cached.skillLevel };
    } else {
      missing.push(id);
    }
  }

  await mapPool(missing, 5, async (playerId) => {
    const { code, body } = await faceitGetAsync(
      `/data/v4/players/${encodeURIComponent(playerId)}`
    );
    const parsed =
      code === 200 ? parsePlayerElo(body) : { elo: null, skillLevel: null };
    cacheSet(playerId, parsed);
    elos[playerId] = parsed;
  });

  res.set("Cache-Control", "private, max-age=60");
  return res.status(200).json({ elos });
});

module.exports = router;