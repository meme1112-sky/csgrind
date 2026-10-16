from __future__ import annotations

from typing import Any

import httpx

from app.config import settings


def _unwrap_payload(data: dict[str, Any]) -> dict[str, Any]:
    p = data.get("payload")
    if isinstance(p, dict):
        return p
    return data


class FaceitClient:
    def __init__(self) -> None:
        self._data_base = settings.faceit_api_base.rstrip("/")
        self._download_base = settings.faceit_download_api_base.rstrip("/")
        self._key = settings.faceit_key
        self._download_token = settings.faceit_download_token

    def _data_headers(self) -> dict[str, str]:
        if not self._key:
            raise RuntimeError("FACEIT_KEY is not set")
        return {"Authorization": f"Bearer {self._key}", "Accept": "application/json"}

    def get_player_by_nickname(self, nickname: str) -> dict[str, Any]:
        url = f"{self._data_base}/data/v4/players"
        with httpx.Client(timeout=60.0) as client:
            r = client.get(url, params={"nickname": nickname}, headers=self._data_headers())
            r.raise_for_status()
            return _unwrap_payload(r.json())

    def get_player_by_steam64(self, steam64: str) -> dict[str, Any]:
        """Resolve CS2 SteamID64 → FACEIT player (requires game linked on FACEIT)."""
        url = f"{self._data_base}/data/v4/players"
        params = {"game": "cs2", "game_player_id": str(steam64).strip()}
        with httpx.Client(timeout=60.0) as client:
            r = client.get(url, params=params, headers=self._data_headers())
            if r.status_code == 404:
                raise RuntimeError(
                    "No FACEIT profile for this Steam ID (CS2). "
                    "Link Steam to FACEIT and play at least one CS2 match on FACEIT."
                )
            r.raise_for_status()
            return _unwrap_payload(r.json())

    def get_history(
        self, player_id: str, game: str = "cs2", offset: int = 0, limit: int = 20
    ) -> dict[str, Any]:
        url = f"{self._data_base}/data/v4/players/{player_id}/history"
        params = {"game": game, "offset": offset, "limit": limit}
        with httpx.Client(timeout=60.0) as client:
            r = client.get(url, params=params, headers=self._data_headers())
            r.raise_for_status()
            return _unwrap_payload(r.json())

    def get_match(self, match_id: str) -> dict[str, Any]:
        url = f"{self._data_base}/data/v4/matches/{match_id}"
        with httpx.Client(timeout=60.0) as client:
            r = client.get(url, headers=self._data_headers())
            r.raise_for_status()
            return _unwrap_payload(r.json())

    def get_signed_demo_url(self, resource_url: str) -> str:
        if not self._download_token:
            raise RuntimeError(
                "FACEIT_DOWNLOAD_TOKEN is not set. Apply for a Downloads API token at "
                "https://fce.gg/downloads-api-application — it is not the same key as FACEIT_KEY."
            )
        try:
            self._download_token.encode("ascii")
        except UnicodeEncodeError as e:
            raise RuntimeError(
                "FACEIT_DOWNLOAD_TOKEN must be ASCII only (copy-paste often inserts wrong characters, e.g. Ø vs 0). "
                "Regenerate the token in FACEIT Developer Portal and paste again."
            ) from e
        url = f"{self._download_base}/download/v2/demos/download"
        headers = {
            "Authorization": f"Bearer {self._download_token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        with httpx.Client(timeout=120.0) as client:
            r = client.post(url, json={"resource_url": resource_url}, headers=headers)
        if r.status_code >= 400:
            snippet = (r.text or "")[:1500]
            raise RuntimeError(
                f"FACEIT Downloads API HTTP {r.status_code} on POST /download/v2/demos/download. "
                "Use a token with Downloads API scope from https://fce.gg/downloads-api-application — "
                f"not the Data API (FACEIT_KEY). Response: {snippet}"
            )
        try:
            body = r.json()
        except Exception as e:
            raise RuntimeError(
                f"Downloads API returned non-JSON (status {r.status_code}): {(r.text or '')[:800]}"
            ) from e
        payload = body.get("payload") if isinstance(body, dict) else None
        if isinstance(payload, dict) and payload.get("download_url"):
            return str(payload["download_url"])
        raise RuntimeError(
            f"Downloads API response missing payload.download_url (see https://docs.faceit.com/getting-started/Guides/download-api/). Body: {body!r}"
        )
