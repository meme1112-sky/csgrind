const path = require("path");

const root = __dirname;
const isWin = process.platform === "win32";
const extraBackendPython = isWin
  ? path.join(root, "extra-backend", ".venv", "Scripts", "python.exe")
  : path.join(root, "extra-backend", ".venv", "bin", "python");
module.exports = {
  apps: [
    {
      name: "extra-backend",
      cwd: path.join(root, "extra-backend"),
      script: extraBackendPython,
      args: "-m uvicorn app.main:app --host 0.0.0.0 --port 8000",
      interpreter: "none",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "5s",
    },
    {
      name: "celery-w",
      cwd: path.join(root, "extra-backend"),
      script: extraBackendPython,
      // Run celery via Python's -m so PM2 never tries to execute the celery
      // shebang script with Node (which fails on the "# -*- coding" line).
      args: `-m celery -A run_celery:app worker --loglevel=info${
        isWin ? " --pool=solo" : ""
      }`,
      interpreter: "none",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "5s",
    },
    {
      name: "celery-beat",
      cwd: path.join(root, "extra-backend"),
      script: extraBackendPython,
      // Schedules periodic tasks (e.g. demo retention cleanup). One instance only.
      args: "-m celery -A run_celery:app beat --loglevel=info",
      interpreter: "none",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "5s",
    },
    {
      name: "backend",
      cwd: path.join(root, "backend"),
      script: "src/server.js",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "5s",
      env: {
        NODE_ENV: "production",
        PORT: 5000,
        // Same host as PM2: Python extra-backend (see extra-backend app above).
        EXTRA_BACKEND_URL: "http://127.0.0.1:8000",
      },
    },
    {
      name: "frontend",
      cwd: path.join(root, "frontend"),
      script: path.join("node_modules", "next", "dist", "bin", "next"),
      args: "start",
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "5s",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        // Same host as PM2: Node Express backend (see backend app above).
        BACKEND_URL: "http://127.0.0.1:5000",
      },
    },
  ],
};
