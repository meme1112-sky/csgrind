"""Valve match history API (share codes)."""

from __future__ import annotations

import httpx

from app.config import settings


class ValveMatchHistoryError(RuntimeError):
    pass


def get_next_match_sharing_code(
    steam_id: str,
    auth_code: str,
    known_code: str,
) -> str:
    """
    Walk backward in a player's MM history.
    https://developer.valvesoftware.com/wiki/Counter-Strike:_Global_Offensive_Access_Match_History
    """
    key = (settings.steam_api_key or "").strip()
    if not key:
        raise ValveMatchHistoryError("STEAM_API_KEY is not configured")

    url = "https://api.steampowered.com/ICSGOPlayers_730/GetNextMatchSharingCode/v1/"
    params = {
        "key": key,
        "steamid": steam_id,
        "steamidkey": auth_code.strip(),
        "knowncode": known_code.strip(),
    }
    with httpx.Client(timeout=30.0) as client:
        res = client.get(url, params=params)
        if res.status_code != 200:
            raise ValveMatchHistoryError(
                f"GetNextMatchSharingCode HTTP {res.status_code}: {res.text[:500]}"
            )
        data = res.json()

    result = data.get("result") or {}
    next_code = result.get("nextcode") or result.get("next_code")
    if not next_code or not str(next_code).strip():
        raise ValveMatchHistoryError("No further match share codes in history")
    return str(next_code).strip()


def fetch_match_demo_url(
    steam_id: str,
    auth_code: str,
    match_id: int,
    outcome_id: int,
) -> str | None:
    """
  Attempt to resolve a Valve-hosted demo URL via Steam Web API.
  Undocumented; may return None when Valve does not expose a link.
  """
    key = (settings.steam_api_key or "").strip()
    if not key:
        return None

    url = "https://api.steampowered.com/ICSGOPlayers_730/GetMatchDetails/v1/"
    params = {
        "key": key,
        "steamid": steam_id,
        "matchid": str(match_id),
        "outcomeid": str(outcome_id),
        "authcode": auth_code.strip(),
    }
    with httpx.Client(timeout=45.0) as client:
        res = client.get(url, params=params)
        if res.status_code != 200:
            return None
        data = res.json()

    return _extract_demo_url(data)


def _extract_demo_url(payload: object) -> str | None:
    if not isinstance(payload, dict):
        return None

    def walk(obj: object) -> str | None:
        if isinstance(obj, str):
            low = obj.lower()
            if (".dem.bz2" in low or ".dem.gz" in low or low.endswith(".dem")) and (
                "valve.net" in low or low.startswith("http")
            ):
                return obj
            return None
        if isinstance(obj, dict):
            for key in ("download_url", "demo_url", "demoUrl", "url"):
                val = obj.get(key)
                if isinstance(val, str) and val.strip():
                    found = walk(val)
                    if found:
                        return found
            for val in obj.values():
                found = walk(val)
                if found:
                    return found
        if isinstance(obj, list):
            for item in obj:
                found = walk(item)
                if found:
                    return found
        return None

    return walk(payload)
