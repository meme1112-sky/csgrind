require("dotenv").config();

module.exports = {
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "3001", 10),
  faceit: {
    apiKey: process.env.FACEIT_KEY || "",
    baseUrl: "open.faceit.com",
  },
  /** Python FastAPI (extra-backend): demo pipeline, analytics, match sync */
  extraBackend: {
    url: (process.env.EXTRA_BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, ""),
  },
};
