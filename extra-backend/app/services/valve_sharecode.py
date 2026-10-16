"""Decode CS2/CSGO match share codes (ported from akiver/csgo-sharecode)."""

from __future__ import annotations

import re
from dataclasses import dataclass

# Valve share-code alphabet (ambiguous I/L/O/0/1 omitted). Case-sensitive.
_DICTIONARY = "ABCDEFGHJKLMNOPQRSTUVWXYZabcdefhijkmnopqrstuvwxyz23456789"
_DICTIONARY_LENGTH = len(_DICTIONARY)
_DICTIONARY_SET = set(_DICTIONARY)

# Bare code or embedded in a full Steam share URL / clipboard paste.
_EXTRACT_RE = re.compile(r"CSGO(?:-?[A-Za-z0-9]{5}){5}", re.IGNORECASE)
_SHARECODE_PATTERN = re.compile(r"^CSGO(-[A-Za-z0-9]{5}){5}$")


@dataclass(frozen=True)
class MatchInformation:
    match_id: int
    reservation_id: int
    tv_port: int


class InvalidShareCode(ValueError):
    pass


def extract_match_share_code(raw: str) -> str:
    """
    Pull `CSGO-xxxxx-xxxxx-xxxxx-xxxxx-xxxxx` out of clipboard text.

    Accepts a bare code or a full Steam URL / paste that contains the code.
    Preserves Valve dictionary letter case (do not blindly uppercase).
    """
    text = (raw or "").strip()
    if not text:
        raise InvalidShareCode("Empty share code")

    m = _EXTRACT_RE.search(text)
    if not m:
        raise InvalidShareCode(
            "No CSGO share code found — paste the full Steam share link or CSGO-xxxxx-… code"
        )

    matched = m.group(0)
    # Strip leading CSGO (any case), then dashes
    body = re.sub(r"^CSGO", "", matched, count=1, flags=re.IGNORECASE).replace("-", "")
    if len(body) != 25:
        raise InvalidShareCode("Invalid share code length")

    for ch in body:
        if ch not in _DICTIONARY_SET:
            raise InvalidShareCode(
                f"Invalid character {ch!r} in share code — copy again from CS2 (do not retype)"
            )

    return "CSGO-" + "-".join(body[i : i + 5] for i in range(0, 25, 5))


def _string_to_bytes(hex_str: str) -> list[int]:
    return [int(hex_str[i : i + 2], 16) for i in range(0, len(hex_str), 2)]


def _bytes_to_big_int(bytes_list: list[int]) -> int:
    return int("".join(f"{b:02x}" for b in bytes_list), 16)


def _share_code_to_bytes(share_code: str) -> list[int]:
    code = extract_match_share_code(share_code)
    if not _SHARECODE_PATTERN.match(code):
        raise InvalidShareCode("Invalid share code format")
    compact = code.replace("CSGO", "").replace("-", "")
    chars = list(reversed(compact))
    big = 0
    for ch in chars:
        try:
            idx = _DICTIONARY.index(ch)
        except ValueError as e:
            raise InvalidShareCode(f"Invalid character in share code: {ch!r}") from e
        big = big * _DICTIONARY_LENGTH + idx
    hex_str = format(big, "x").zfill(36)
    return _string_to_bytes(hex_str)


def decode_match_share_code(share_code: str) -> MatchInformation:
    raw = _share_code_to_bytes(share_code)
    match_id = _bytes_to_big_int(list(reversed(raw[0:8])))
    reservation_id = _bytes_to_big_int(list(reversed(raw[8:16])))
    tv_port = (raw[16] << 8) + raw[17]
    return MatchInformation(
        match_id=match_id,
        reservation_id=reservation_id,
        tv_port=tv_port,
    )


def _u64_le_bytes(n: int) -> list[int]:
    x = int(n) & ((1 << 64) - 1)
    out: list[int] = []
    for _ in range(8):
        out.append(x & 0xFF)
        x >>= 8
    return out


def encode_match_share_code(info: MatchInformation) -> str:
    """Build `CSGO-…` from match / reservation / tv_port (inverse of decode)."""
    tv = int(info.tv_port) & 0xFFFF
    # decode: match_id = big_int(reversed(raw[0:8])) ⇒ raw[0:8] is little-endian.
    # decode: tv_port = (raw[16] << 8) + raw[17] ⇒ big-endian uint16.
    raw = (
        _u64_le_bytes(info.match_id)
        + _u64_le_bytes(info.reservation_id)
        + [(tv >> 8) & 0xFF, tv & 0xFF]
    )
    big = int("".join(f"{b:02x}" for b in raw), 16)
    chars: list[str] = []
    for _ in range(25):
        big, rem = divmod(big, _DICTIONARY_LENGTH)
        chars.append(_DICTIONARY[rem])
    body = "".join(chars)
    return "CSGO-" + "-".join(body[i : i + 5] for i in range(0, 25, 5))


# Valve downloaded demos: match730_<matchId>_<reservationId>_<tvPort>.dem
_DEMO_FILENAME_RE = re.compile(
    r"match730[_-](\d+)[_-](\d+)[_-](\d+)",
    re.IGNORECASE,
)


def share_code_from_demo_filename(filename: str) -> str | None:
    """
    Derive a share code from a Valve-style demo filename when possible.

    Example: match730_003847728241183818026_0797366198_273.dem
    """
    name = (filename or "").strip()
    if not name:
        return None
    m = _DEMO_FILENAME_RE.search(name)
    if not m:
        return None
    try:
        info = MatchInformation(
            match_id=int(m.group(1)),
            reservation_id=int(m.group(2)),
            tv_port=int(m.group(3)) & 0xFFFF,
        )
    except ValueError:
        return None
    return encode_match_share_code(info)


def resolve_upload_share_code(*, share_code_raw: str | None, filename: str) -> str:
    """
    Prefer an explicit share code; otherwise derive from Valve demo filename.

    Manual upload should not require pasting CSGO-… when the .dem name already
    encodes match / reservation / tv port.
    """
    raw = (share_code_raw or "").strip()
    if raw:
        try:
            return extract_match_share_code(raw)
        except InvalidShareCode:
            # Fall through to filename if paste was junk but file is Valve-named.
            pass
    from_name = share_code_from_demo_filename(filename)
    if from_name:
        return from_name
    if raw:
        # Re-raise original paste error.
        return extract_match_share_code(raw)
    raise InvalidShareCode(
        "Can't detect match from this filename. Paste a CSGO-… share code, "
        "or use the original Valve name "
        "(match730_<matchId>_<reservationId>_<tvPort>.dem)."
    )
