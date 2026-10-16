const rateLimit = require("express-rate-limit");

function envInt(name, fallback) {
  const raw = (process.env[name] || "").trim();
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function rateLimitEnabled() {
  const raw = (process.env.RATE_LIMIT_ENABLED || "true").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}

function clientIp(req) {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf.trim()) return cf.trim();
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real.trim()) return real.trim();
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

/**
 * Shared factory for Express rate limits (backup if Express is publicly reachable).
 */
function createLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => !rateLimitEnabled(),
    keyGenerator: (req) => clientIp(req),
    // Express is behind Next / proxies — trust X-Forwarded-For when present.
    validate: { xForwardedForHeader: false },
    handler: (_req, res) => {
      res.status(429).json({
        error: "Too many requests",
        detail: message || "Rate limit exceeded. Please wait and try again.",
      });
    },
  });
}

const faceitLimiter = createLimiter({
  windowMs: envInt("RATE_LIMIT_FACEIT_WINDOW_MS", 60_000),
  max: envInt("RATE_LIMIT_FACEIT_LIMIT", 120),
  message: "FACEIT proxy rate limit exceeded.",
});

const v1Limiter = createLimiter({
  windowMs: envInt("RATE_LIMIT_ANALYTICS_WINDOW_MS", 60_000),
  max: envInt("RATE_LIMIT_ANALYTICS_LIMIT", 60),
  message: "Analytics proxy rate limit exceeded.",
});

module.exports = {
  faceitLimiter,
  v1Limiter,
  rateLimitEnabled,
};
