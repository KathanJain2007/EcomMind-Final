"""Gmail-only email validation.

Kept rule-for-rule identical to src/lib/validation/email.ts so the browser and
the API never disagree. Steps:

1. Trim surrounding whitespace.
2. Check the general address shape (one "@", a valid local part, a valid
   domain). Failure -> INVALID_FORMAT.
3. The domain, compared case-insensitively, must be exactly "gmail.com".
   Failure -> UNSUPPORTED_DOMAIN.
4. The local part must follow Gmail's username rules: 6-30 letters, digits or
   dots, not starting/ending with a dot, no consecutive dots, plus an optional
   "+tag". Failure -> INVALID_FORMAT.

The stored address is lower-cased. For uniqueness we also compute a canonical
form with dots and "+tag" removed, because Gmail delivers a.b+shop@gmail.com
and ab@gmail.com to the same inbox.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

INVALID_FORMAT = "invalid_email"
UNSUPPORTED_DOMAIN = "unsupported_email_domain"

MESSAGES = {
    INVALID_FORMAT: "Please enter a valid email address.",
    UNSUPPORTED_DOMAIN: "Only Gmail addresses ending in @gmail.com are accepted.",
}

GMAIL_DOMAIN = "gmail.com"
MAX_LENGTH = 254

# General shape: dot-atom local part, then a domain of LDH labels with a TLD.
_LOCAL_ATOM = r"[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+"
_GENERAL_RE = re.compile(
    rf"^{_LOCAL_ATOM}(?:\.{_LOCAL_ATOM})*@"
    r"(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$"
)
# Gmail username: 6-30 chars of letters/digits/dots, no leading/trailing/double
# dot. Optional "+tag" for sub-addressing.
_GMAIL_USER_RE = re.compile(r"^(?=.{6,30}$)[a-z0-9]+(?:\.[a-z0-9]+)*$")
_GMAIL_TAG_RE = re.compile(r"^[a-z0-9._-]{1,40}$")


@dataclass(frozen=True)
class EmailCheck:
    ok: bool
    email: str | None = None  # normalised (trimmed, lower-cased)
    canonical: str | None = None  # dots and +tag removed, for uniqueness
    code: str | None = None
    message: str | None = None


def _fail(code: str) -> EmailCheck:
    return EmailCheck(ok=False, code=code, message=MESSAGES[code])


def validate_gmail(raw: object) -> EmailCheck:
    if not isinstance(raw, str):
        return _fail(INVALID_FORMAT)
    value = raw.strip()
    if not value or len(value) > MAX_LENGTH or any(ch.isspace() for ch in value):
        return _fail(INVALID_FORMAT)
    if value.count("@") != 1 or not _GENERAL_RE.match(value):
        return _fail(INVALID_FORMAT)

    local, domain = value.rsplit("@", 1)
    if len(local) > 64:
        return _fail(INVALID_FORMAT)
    if domain.lower() != GMAIL_DOMAIN:
        return _fail(UNSUPPORTED_DOMAIN)

    local = local.lower()
    user, _, tag = local.partition("+")
    if not _GMAIL_USER_RE.match(user):
        return _fail(INVALID_FORMAT)
    if "+" in local and not _GMAIL_TAG_RE.match(tag):
        return _fail(INVALID_FORMAT)

    email = f"{local}@{GMAIL_DOMAIN}"
    canonical = f"{user.replace('.', '')}@{GMAIL_DOMAIN}"
    return EmailCheck(ok=True, email=email, canonical=canonical)
