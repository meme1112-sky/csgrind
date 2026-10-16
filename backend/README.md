# Backend

Express API for FaceIT (CS2/CSGO) proxy endpoints.

## Structure

```
backend/
├── src/
│   ├── config/          # Environment and app config
│   │   └── index.js
│   ├── middleware/      # Express middleware (404, error handler)
│   │   ├── index.js
│   │   ├── notFound.js
│   │   └── errorHandler.js
│   ├── routes/          # Route definitions
│   │   └── faceit.routes.js
│   ├── services/        # External API / business logic
│   │   └── faceit.service.js
│   ├── app.js           # Express app (no listen)
│   └── server.js        # Start server (listen)
├── index.js             # Legacy entry (requires src/server.js)
├── package.json
├── .env                 # Local env (not committed)
└── .env.example         # Required env vars template
```

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and set `FACEIT_KEY` (see [FaceIT Developers](https://developers.faceit.com/)).

## Scripts

- `npm start` — run server
- `npm run dev` — run with `--watch` for reload on file change

## Endpoints

| Method | Path | Query | Description |
|--------|------|-------|-------------|
| GET | `/health` | — | Health check |
| GET | `/faceit/player` | `steam64` | Player by Steam64 (CS2 then CSGO) |
| GET | `/faceit/stats` | `player_id`, `game` (optional) | Player stats |
| GET | `/faceit/history` | `player_id`, `game`, `limit` (optional) | Match history |

### Demo pipeline (extra-backend)

All FastAPI routes under `/v1/...` are **reverse-proxied** to the Python service (`EXTRA_BACKEND_URL`, default `http://127.0.0.1:8000`). Run [extra-backend](../extra-backend) (uvicorn) on that port, then call the same paths on this server, for example `GET http://localhost:3001/v1/players/{faceit_player_id}/matches`.

`/faceit` and `/v1` also have Express rate limits (see `RATE_LIMIT_*` in `.env.example`) as a backup if this port is publicly reachable.
