"""Service-to-service auth for sensitive FastAPI routes."""

from __future__ import annotations

import secrets
from typing import Annotated

from fastapi import Header, HTTPException

from app.config import settings

INTERNAL_TOKEN_HEADER = "X-Internal-Token"


def require_internal_auth(
    x_internal_token: Annotated[str | None, Header(alias=INTERNAL_TOKEN_HEADER)] = None,
) -> None:
    """
    Require a shared secret from trusted callers (Next.js BFF / Express).

    - If INTERNAL_API_SECRET is set: token must match (constant-time compare).
    - If unset: allow in non-production for local DX; reject in production.
    """
    expected = (settings.internal_api_secret or "").strip()
    if not expected:
        if settings.is_production:
            raise HTTPException(
                status_code=503,
                detail="INTERNAL_API_SECRET is not configured",
            )
        return

    provided = (x_internal_token or "").strip()
    if not provided or not secrets.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")
