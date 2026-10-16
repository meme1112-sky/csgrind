const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const config = require("./config");
const faceitRoutes = require("./routes/faceit.routes");
const { notFound, errorHandler } = require("./middleware");
const { faceitLimiter, v1Limiter } = require("./middleware/rateLimit");

const app = express();

// If Express is behind nginx / Cloudflare / Next, enable for correct client IPs.
app.set("trust proxy", 1);

// Proxy before express.json() so request bodies stream through to FastAPI unchanged.
const hourMs = 60 * 60 * 1000;
// Express strips the mount path from req.url, so the proxy would otherwise call
// extra-backend at /analytics/... instead of /v1/analytics/... (404).
const extraBackendProxy = createProxyMiddleware({
  target: config.extraBackend.url,
  changeOrigin: true,
  timeout: hourMs,
  proxyTimeout: hourMs,
  pathRewrite: (path) => (path.startsWith("/v1") ? path : `/v1${path}`),
  on: {
    proxyReq(proxyReq, req) {
      // Forward service token from trusted callers (Next.js BFF). Do not invent one here —
      // otherwise any client that can reach Express could unlock FastAPI write routes.
      const incoming = req.headers["x-internal-token"];
      if (typeof incoming === "string" && incoming.trim()) {
        proxyReq.setHeader("X-Internal-Token", incoming.trim());
      } else {
        proxyReq.removeHeader("X-Internal-Token");
      }
    },
    error(err, req, res) {
      if (typeof res.status === "function" && !res.headersSent) {
        res.status(502).json({
          error: "extra-backend unreachable",
          detail: err && err.message ? err.message : String(err),
        });
      }
    },
  },
});

app.use("/v1", v1Limiter, extraBackendProxy);

app.use(express.json());

// API routes
app.use("/faceit", faceitLimiter, faceitRoutes);

// Health check (optional, useful for load balancers / k8s)
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// 404 and error handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;
