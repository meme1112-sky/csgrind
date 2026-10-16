## extra-backend (CSGrind) — FACEIT demo pipeline + Leetify-style analytics

This service is a **FastAPI backend** that:

- Resolves a **SteamID64 → FACEIT player**
- Pulls **FACEIT match history**
- Downloads the match **demo** (requires FACEIT **Downloads API token**)
- Decompresses and parses the `.dem`
- Computes **demo-derived analytics**:
  - HLTV-style rating, impact, ADR, KAST, K/D, headshot %
- **Time To Damage** / **Crosshair placement** (Leetify-aligned; see `app/services/aim_metrics.py`)
  - TTD: average ms from enemy first **visible** engagement (FOV + LOS/spotted when available) to first firearm damage
  - Crosshair placement: median degrees of eye-angle travel from that first see → first hit (converted only; `crosshair_placement`)
  - Output is scaled toward Leetify public magnitudes (`leetify_ttd_scale` / `leetify_preaim_scale` in `AimConfig`, fit on FACEIT L10 anchors) so Premier risk bands and client comparisons are usable
  - Note: FOV-only starts (no LOS) inflate both metrics badly; LOS gating is required before scaling
  - **Kills through smokes** (kills whose line of sight crosses an active smoke cloud)
  - **Utility damage** (HE / molotov / incendiary damage per match)
  - **Opening duels** won/lost and opening win %
  - **Multi-kill rounds** (2K / 3K / 4K / 5K averages)
  - Per-grenade-type throw counts
- Returns a **single “Leetify-inspired” dashboard JSON** from one endpoint

Important: this is **demo-derived analytics only**. It does **not** include Leetify’s proprietary benchmarking/percentiles.

---

## Requirements

- **Windows** (works on others too, commands below are PowerShell)
- **Python 3.11+** (required by `awpy`)
- **Redis + Celery worker** (required for the non-blocking `by-steam` refresh; or set `CELERY_EAGER=true`)

---

## Install

From `extra-backend/`:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -U pip
pip install -r requirements.txt
```

---

## Configuration (`.env`)

Copy `.env.example` to `.env` and fill:

- **`FACEIT_KEY`**: FACEIT Data API key (players, matches, history)
- **`FACEIT_DOWNLOAD_TOKEN`**: FACEIT **Downloads API** token (signed demo URLs)
- **`INTERNAL_API_SECRET`**: shared with the Next.js frontend; required on write/sensitive routes (`X-Internal-Token`). Set `ENVIRONMENT=production` in prod so missing secret fails closed.
- **`SESSION_SECRET`**: configured on the **frontend** (not here) for signed Steam sessions

### Service auth (production)

Sensitive routes (Valve link/sync, **manual Valve demo upload**, match process/recompute, demo archive, analytics `refresh=true`, debug) require header:

`X-Internal-Token: <INTERNAL_API_SECRET>`

The Next.js BFF injects this server-side. Public browser `POST /api/v1/*` is blocked (405).

### Manual Valve demo upload

When Steam does not return a demo URL (`no_demo`), signed-in users can upload a Premier `.dem` / `.dem.bz2` on `/profile/link-valve`.

**Chunked upload (required behind Cloudflare Free)** — single requests over ~100 MB get HTTP 413 from Cloudflare. The UI uploads in **8 MB** chunks:

- `POST /v1/valve/matches/upload/init` — `steam_id`, `share_code`, `filename`, `total_bytes`
- `PUT /v1/valve/matches/upload/{upload_id}/chunks/{index}` — raw body
- `POST /v1/valve/matches/upload/{upload_id}/complete` — assemble + enqueue parse
- Frontend BFF: `/api/user/valve-demo-upload/init`, `…/{id}/chunks/{i}`, `…/{id}/complete` (Steam session required)
- Legacy single-shot `POST /v1/valve/matches/upload` still exists for local/dev only
- On the VPS, keep nginx `client_max_body_size` ≥ **16m** (chunks are 8 MB; 400m is fine)
- Parsed Valve demos feed **Neok AI integrity** (TTD / crosshair / etc.) alongside FACEIT — see `coverage.by_source` on `/v1/analytics/by-steam/...`

Notes:

- `FACEIT_DOWNLOAD_TOKEN` is **NOT** the same as `FACEIT_KEY`.
- Downloads API access requires applying at `https://fce.gg/downloads-api-application`.
- The token must be **ASCII-only** (copy/paste can introduce lookalike characters).

---

## Run the API

```powershell
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Health check:

```powershell
curl http://127.0.0.1:8000/health
```

### Celery task priority

Redis broker uses priority queues so interactive work is not buried behind bulk FACEIT jobs:

| Priority | Tasks |
| ---: | --- |
| 9 | `demos.process_valve_upload` (manual demo parse) |
| 7 | `demos.sync_valve_mm` |
| 5 | `demos.process_match` (default) |
| 4 | history / analytics refresh |
| 3 | proactive FACEIT archive |
| 1 | daily demo cleanup |

Restart `celery-w` after deploy so workers pick up the broker transport options.

### Via the Node `backend/` (same `/v1` paths)

The Express app reverse-proxies `/v1` to this service (`EXTRA_BACKEND_URL`, default `http://127.0.0.1:8000`). With the Node API on port **3001**, use `http://localhost:3001/v1/...` instead of port 8000. The Next.js frontend can call **`/api/v1/...`** (server-side proxy to `BACKEND_URL`); see `frontend/.env.example`.

---

## The dashboard endpoint (non-blocking)

This is the endpoint meant for the UI. It is **non-blocking**: it returns analytics already cached in
the DB **immediately**, and (by default) enqueues a **Celery** background job that resolves
Steam → FACEIT, downloads the newest demos, parses them, and stores fresh analytics.

```http
GET /v1/analytics/by-steam/{steam_id}?max_matches=5&scan_recent=50
```

Where:

- **`steam_id`**: SteamID64 (e.g. `7656119...`)
- **`scan_recent`**: how many matches to fetch from FACEIT history (newest first) — default **50**
- **`max_matches`**: how many of those matches the background refresh **downloads+parses** — default **5**
- **`refresh`**: set `false` to read the cache only (do **not** enqueue a background job)

Example:

```powershell
curl "http://127.0.0.1:8000/v1/analytics/by-steam/76561199523285736?max_matches=3&scan_recent=10"
```

### What it returns

A single dashboard payload (served instantly from cache):

- **`categories`**: Leetify-like cards (Combat / Aim / Utility) with `metrics[]`
- **`rollup`**: session averages
- **`matches`**: per-match breakdown (plus `raw_stats`)
- **`pipeline`**: FACEIT id, nickname, and (when empty) per-status diagnostics
- **`status`**: `ready` (cached data present), `refreshing` (empty, refresh running), or `empty`
- **`job`**: the enqueued refresh — `{ "task_id": "...", "state": "queued" }` (or `state: "done"`/`"eager"`
  when `CELERY_EAGER=true`, or `state: "error"` with a message if the broker is unreachable)

### Polling for the background refresh

Poll the job until it is `ready`, then re-fetch `by-steam` (ideally with `refresh=false`) to read the
fresh cache:

```http
GET /v1/analytics/jobs/{task_id}
```

Returns Celery task state, e.g.:

```json
{ "task_id": "…", "state": "SUCCESS", "ready": true, "successful": true, "result": { … } }
```

The first request for a brand-new Steam ID returns an empty dashboard (`status: "refreshing"`); once the
job finishes, the cache is populated and subsequent requests return data instantly.

### Requirements for the refresh

The background refresh needs `FACEIT_KEY` + `FACEIT_DOWNLOAD_TOKEN` and a running **Celery worker**
(see below). If you don't want to run Redis/Celery, set `CELERY_EAGER=true` to run the refresh **inline**
— this makes the call **blocking** again (can take minutes), but requires no broker.

The refresh is **idempotent**: already-parsed, current-schema demos are skipped, so repeated calls only
do heavy work for new or previously failed matches.

---

## Data storage

- SQLite DB (default): `./data/csgrind_demos.db`
- Demo files: `./data/demos/<match_id>/...`

Each match row stores:

- status (`pending`, `downloading`, `decompressing`, `parsing`, `parsed`, `failed`, `no_demo`)
- `parse_summary`
- `analytics` (the per-player analytics JSON, `kind: csgrind_match_analytics_v3`)

### Demo disk retention

After a match is **successfully parsed**, the pipeline **deletes the compressed download**
(`.dem.zst` / `.gz` / `.bz2`, etc.) and clears `local_archive_path`. It **keeps** `parsed.dem`
for a limited time so analytics schema bumps can re-parse locally without re-downloading.

**`DEMO_RETENTION_DAYS`** (default **14**, `0` = keep forever): Celery Beat runs
`demos.cleanup_expired_demos` daily (03:30 UTC) and deletes local demo files older than N days
by file mtime. Match **analytics in the DB are kept**. If a later re-parse needs the file and
FACEIT still hosts it, the pipeline re-downloads.

Failed / in-progress downloads newer than the retention window are left alone.

One-shot / dry-run from `extra-backend/`:

```bash
./.venv/bin/python -m app.services.cleanup_demos --dry-run
./.venv/bin/python -m app.services.cleanup_demos
```

PM2 should run both `celery-w` and `celery-beat` (see root `ecosystem.config.js`).

If you upgraded from a previous version and have rows already stored as `csgrind_match_analytics_v1` or `csgrind_match_analytics_v2`,
the pipeline will **auto-recompute** them from the local `.dem` the next time the match is touched
(no FACEIT re-download). The first call to `/v1/analytics/by-steam/...` after upgrading therefore
takes a while as those demos are re-parsed once. You can also force it manually for a single match:

```http
POST /v1/matches/{match_id}/analytics/recompute
```

If the local `.dem` was deleted, the pipeline will re-download it before re-parsing.

---

## Troubleshooting

### “All matches are failed”

Most common causes:

- Missing/invalid **`FACEIT_DOWNLOAD_TOKEN`**
- Token is not Downloads-scope (using `FACEIT_KEY` by mistake)
- Token contains non-ASCII characters (copy/paste issue)
- Match has **no demo URL** (older matches / not ready)

The endpoint error response includes:

- `pipeline.process_errors`
- `sample_row_errors`
- `matches_by_status_for_player`

Use those fields to see the exact failure reason.

### “No FACEIT profile for this Steam ID”

The Steam account must be linked to FACEIT and have CS2 on FACEIT.

---

## Run with Redis + Celery (required for the non-blocking refresh)

The `GET /v1/analytics/by-steam` background refresh runs on a **Celery worker**. Run Redis + a worker as
below, **or** set `CELERY_EAGER=true` to run refreshes inline without a broker (which makes the endpoint
blocking again).

Redis (Docker example):

```powershell
docker run --name csgrind-redis -p 6379:6379 -d redis:7
```

Worker (Windows needs solo pool):

```powershell
celery -A run_celery:app worker --pool=solo --loglevel=info
```

