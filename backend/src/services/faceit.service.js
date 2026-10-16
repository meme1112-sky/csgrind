const https = require("https");
const config = require("../config");

function readFaceitHttpTimeoutMs() {
  const n = parseInt(process.env.FACEIT_HTTP_TIMEOUT_MS || "20000", 10);
  if (!Number.isFinite(n)) return 20000;
  return Math.min(Math.max(n, 3000), 120_000);
}
const FACEIT_HTTP_TIMEOUT_MS = readFaceitHttpTimeoutMs();

/**
 * Low-level GET request to FaceIT Open API.
 * @param {string} path - API path (e.g. /data/v4/players?game=cs2&game_player_id=...)
 * @param {function(number, string): void} callback - (statusCode, body) => void
 */
function faceitGet(path, callback) {
  let settled = false;
  const done = (code, body) => {
    if (settled) return;
    settled = true;
    callback(code, body);
  };

  const options = {
    hostname: config.faceit.baseUrl,
    path,
    method: "GET",
    headers: config.faceit.apiKey ? { Authorization: `Bearer ${config.faceit.apiKey}` } : {},
  };

  const req = https.request(options, (res) => {
    let buf = "";
    res.on("data", (d) => (buf += d));
    res.on("end", () => done(res.statusCode || 500, buf));
    res.on("error", () => done(502, JSON.stringify({ error: "faceit response error" })));
  });

  req.setTimeout(FACEIT_HTTP_TIMEOUT_MS, () => {
    req.destroy();
    done(504, JSON.stringify({ error: "faceit request timeout" }));
  });

  req.on("error", () => done(502, JSON.stringify({ error: "faceit fetch failed" })));
  req.end();
}

module.exports = {
  faceitGet,
};
