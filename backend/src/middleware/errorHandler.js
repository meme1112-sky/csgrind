const config = require("../config");

/**
 * Global error handler. Use next(err) in routes to reach this.
 */
function errorHandler(err, _req, res, _next) {
  const status = err.statusCode || err.status || 500;
  const message = config.env === "production" ? "Internal server error" : (err.message || "Unknown error");
  res.status(status).json({ error: message });
}

module.exports = errorHandler;
