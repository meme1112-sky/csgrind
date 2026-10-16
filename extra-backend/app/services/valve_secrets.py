"""Encrypt Valve match-history auth codes at rest."""

from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


def _fernet() -> Fernet | None:
    secret = (settings.valve_codes_secret or "").strip()
    if not secret:
        return None
    digest = hashlib.sha256(secret.encode("utf-8")).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_secret(value: str) -> str:
    f = _fernet()
    if f is None:
        return value
    return f.encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_secret(value: str) -> str:
    f = _fernet()
    if f is None:
        return value
    try:
        return f.decrypt(value.encode("ascii")).decode("utf-8")
    except InvalidToken as e:
        raise ValueError("Failed to decrypt stored Valve auth code") from e
