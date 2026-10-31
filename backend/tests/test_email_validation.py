import pytest

from app.validation.email import INVALID_FORMAT, MESSAGES, UNSUPPORTED_DOMAIN, validate_gmail


@pytest.mark.parametrize("raw, expected", [
    ("asha.rao@gmail.com", "asha.rao@gmail.com"),
    ("Asha.Rao@Gmail.COM", "asha.rao@gmail.com"),          # uppercase domain + local part
    ("  asharao99@gmail.com  ", "asharao99@gmail.com"),     # surrounding whitespace trimmed
    ("asharao+shop@gmail.com", "asharao+shop@gmail.com"),   # +tag allowed
    ("abc123@GMAIL.com", "abc123@gmail.com"),
])
def test_valid_gmail(raw, expected):
    r = validate_gmail(raw)
    assert r.ok, r
    assert r.email == expected


def test_canonical_form_ignores_dots_and_tags():
    assert validate_gmail("a.s.h.a.rao+x@gmail.com").canonical == validate_gmail("asharao@gmail.com").canonical


@pytest.mark.parametrize("raw", [
    "", "   ", "plainaddress", "@gmail.com", "asharao@", "asha rao@gmail.com", "asharao@@gmail.com",
    "asharao@gmail", "asharao@gmail..com", ".asharao@gmail.com", "asharao.@gmail.com", "asha..rao@gmail.com",
    "a" * 31 + "@gmail.com",
    "asha_rao@gmail.com",                  # underscores aren't allowed in Gmail usernames
    "asharao@gmail.com.evil.com",          # actually a different domain, but malformed for us? -> unsupported (see below)
], ids=lambda s: repr(s))
def test_invalid_format(raw):
    r = validate_gmail(raw)
    assert not r.ok
    if raw == "asharao@gmail.com.evil.com":
        assert r.code == UNSUPPORTED_DOMAIN
    else:
        assert r.code == INVALID_FORMAT
        assert r.message == "Please enter a valid email address."


@pytest.mark.parametrize("raw", [
    "asharao@yahoo.com", "asharao@outlook.com", "asharao@hotmail.com", "asharao@urbannest.in",
    "asharao@googlemail.com", "asharao@gmail.co", "asharao@mail.gmail.com", "ASHARAO@YAHOO.COM",
])
def test_unsupported_domain(raw):
    r = validate_gmail(raw)
    assert not r.ok
    assert r.code == UNSUPPORTED_DOMAIN
    assert r.message == MESSAGES[UNSUPPORTED_DOMAIN] == "Only Gmail addresses ending in @gmail.com are accepted."


def test_non_string_input():
    assert validate_gmail(None).code == INVALID_FORMAT
    assert validate_gmail(123).code == INVALID_FORMAT


def test_short_usernames_are_valid():
    for addr in ("aryan@gmail.com", "aryan123@gmail.com", "abc@gmail.com"):
        assert validate_gmail(addr).ok, addr
