"""GSTIN structural validation (format only — not proof of registration).

A regular GSTIN has 15 characters:

  positions 1-2   state code (01-38, or 97 "Other Territory", 99 "Centre Jurisdiction")
  positions 3-12  the holder's PAN: 5 letters, 4 digits, 1 letter; the 4th PAN
                  letter is the holder type (P, C, H, F, A, T, B, L, J, G)
  position 13     entity number for that PAN in the state: 1-9 then A-Z
  position 14     "Z" by default
  position 15     check character (Luhn mod 36 over the first 14 characters)

Kept rule-for-rule identical to src/lib/validation/gstin.ts. A valid result
only means the number is well formed. It does NOT mean the GSTIN is registered
or active; that needs the GST portal or an authorised GSP, which is not
integrated, so callers must label the result "format validated".
"""
from __future__ import annotations

import re
from dataclasses import dataclass

CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
STATE_CODES = {f"{n:02d}" for n in range(1, 39)} | {"97", "99"}
PAN_HOLDER_TYPES = set("PCHFATBLJG")

MESSAGES = {
    "gstin_required": "Enter your 15-character GSTIN.",
    "gstin_length": "GSTIN must be exactly 15 characters.",
    "gstin_characters": "GSTIN can contain only letters A-Z and digits 0-9.",
    "gstin_state_code": "The first two digits must be a valid GST state code (01-38, 97 or 99).",
    "gstin_pan": "Characters 3-12 must be a valid PAN (5 letters, 4 digits, 1 letter).",
    "gstin_pan_type": "The 6th character must be a valid PAN holder type (P, C, H, F, A, T, B, L, J or G).",
    "gstin_entity_code": "The 13th character must be 1-9 or A-Z.",
    "gstin_default_char": "The 14th character must be Z.",
    "gstin_checksum": "The last character doesn't match the GSTIN check digit. Please re-check the number.",
}

_PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")


@dataclass(frozen=True)
class GstinCheck:
    ok: bool
    gstin: str | None = None
    code: str | None = None
    message: str | None = None


def normalize(raw: object) -> str:
    if not isinstance(raw, str):
        return ""
    return re.sub(r"\s+", "", raw).upper()


def checksum_char(first14: str) -> str:
    total = 0
    for i, ch in enumerate(first14):
        value = CHARSET.index(ch)
        product = value * (1 if i % 2 == 0 else 2)
        total += product // 36 + product % 36
    return CHARSET[(36 - total % 36) % 36]


def _fail(code: str) -> GstinCheck:
    return GstinCheck(ok=False, code=code, message=MESSAGES[code])


def validate_gstin(raw: object) -> GstinCheck:
    value = normalize(raw)
    if not value:
        return _fail("gstin_required")
    if len(value) != 15:
        return _fail("gstin_length")
    if any(ch not in CHARSET for ch in value):
        return _fail("gstin_characters")
    if value[:2] not in STATE_CODES:
        return _fail("gstin_state_code")
    pan = value[2:12]
    if not _PAN_RE.match(pan):
        return _fail("gstin_pan")
    if pan[3] not in PAN_HOLDER_TYPES:
        return _fail("gstin_pan_type")
    if value[12] == "0":
        return _fail("gstin_entity_code")
    if value[13] != "Z":
        return _fail("gstin_default_char")
    if checksum_char(value[:14]) != value[14]:
        return _fail("gstin_checksum")
    return GstinCheck(ok=True, gstin=value)


def mask(gstin: str | None) -> str | None:
    """22AAAAA0000A1Z5 -> 22AAA*******1Z5 (state + 3 PAN letters + last 3)."""
    if not gstin:
        return None
    return gstin[:5] + "*" * 7 + gstin[-3:]
