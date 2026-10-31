"""Runtime settings, read from environment variables (and backend/.env if present)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path) -> None:
    """Minimal .env loader: KEY=VALUE lines; real environment variables win."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv(BACKEND_DIR / ".env")


def _bool(name: str, default: bool) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class Settings:
    secret_key: str = field(default_factory=lambda: os.environ.get("SECRET_KEY", "dev-insecure-secret-change-me"))
    database_url: str = field(default_factory=lambda: os.environ.get("DATABASE_URL", f"sqlite:///{BACKEND_DIR / 'ecommind.db'}"))
    frontend_origin: str = field(default_factory=lambda: os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000"))
    cookie_secure: bool = field(default_factory=lambda: _bool("COOKIE_SECURE", False))
    session_days: int = 14

    google_maps_api_key: str = field(default_factory=lambda: os.environ.get("GOOGLE_MAPS_API_KEY", "").strip())
    places_region_codes: list[str] = field(default_factory=lambda: [c.strip().lower() for c in os.environ.get("PLACES_REGION_CODES", "in").split(",") if c.strip()])
    places_timeout_seconds: float = 4.0
    location_verification_required: bool = field(default_factory=lambda: _bool("LOCATION_VERIFICATION_REQUIRED", False))

    email_verification: str = field(default_factory=lambda: os.environ.get("EMAIL_VERIFICATION", "optional").strip().lower())
    smtp_host: str = field(default_factory=lambda: os.environ.get("SMTP_HOST", "").strip())
    smtp_port: int = field(default_factory=lambda: int(os.environ.get("SMTP_PORT", "587")))
    smtp_username: str = field(default_factory=lambda: os.environ.get("SMTP_USERNAME", ""))
    smtp_password: str = field(default_factory=lambda: os.environ.get("SMTP_PASSWORD", ""))
    smtp_from: str = field(default_factory=lambda: os.environ.get("SMTP_FROM", ""))
    smtp_starttls: bool = field(default_factory=lambda: _bool("SMTP_STARTTLS", True))

    agent_timeout_seconds: float = field(default_factory=lambda: float(os.environ.get("AGENT_TIMEOUT_SECONDS", "10")))

    @property
    def email_provider_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_from)


settings = Settings()
