"""Password hashing, session tokens and signed receipts (stdlib only)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets

from .config import settings

# scrypt with a random 16-byte salt per password (N=2^15, r=8, p=1: ~32 MB of
# memory per hash). Raise N as hardware allows; old hashes keep verifying
# because the parameters are stored inside each hash.
_N, _R, _P, _DKLEN = 2**15, 8, 1, 64
_MAXMEM = 64 * 1024 * 1024


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=_N, r=_R, p=_P, dklen=_DKLEN, maxmem=_MAXMEM)
    return "scrypt${}${}${}${}${}".format(
        _N, _R, _P, base64.b64encode(salt).decode(), base64.b64encode(dk).decode()
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt_b64, dk_b64 = stored.split("$")
        if algo != "scrypt":
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(dk_b64)
        dk = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=int(n), r=int(r), p=int(p), dklen=len(expected), maxmem=_MAXMEM)
        return hmac.compare_digest(dk, expected)
    except (ValueError, TypeError):
        return False


# A fixed hash used to spend the same time on unknown emails as on wrong passwords.
DUMMY_HASH = hash_password("not-a-real-password")


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    """Sessions and OTPs are stored hashed; the raw value only lives in the cookie/email."""
    return hashlib.sha256((settings.secret_key + ":" + token).encode()).hexdigest()


def sign(*parts: object) -> str:
    """HMAC-SHA256 receipt signature over the transaction fields."""
    msg = "|".join(str(p) for p in parts).encode()
    return "hmac-sha256:" + hmac.new(settings.secret_key.encode(), msg, hashlib.sha256).hexdigest()[:32]


def new_id(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(5).upper()}"
