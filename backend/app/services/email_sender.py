"""Outgoing email for verification codes.

If SMTP isn't configured, `send` raises EmailNotConfigured and callers tell the
user plainly that no email was sent. Nothing pretends a message went out.
"""
from __future__ import annotations

import smtplib
from email.message import EmailMessage

from ..config import settings


class EmailNotConfigured(Exception):
    pass


class EmailSendFailed(Exception):
    pass


# Tests swap this for a fake.
def _deliver(msg: EmailMessage) -> None:
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as s:
        if settings.smtp_starttls:
            s.starttls()
        if settings.smtp_username:
            s.login(settings.smtp_username, settings.smtp_password)
        s.send_message(msg)


deliver = _deliver


def send_verification_code(to: str, code: str) -> None:
    if not settings.email_provider_configured:
        raise EmailNotConfigured()
    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg["Subject"] = "Your EcomMind verification code"
    msg.set_content(f"Your EcomMind verification code is {code}. It expires in 10 minutes.\n\n"
                    "If you didn't request this, you can ignore this email.")
    try:
        deliver(msg)
    except (OSError, smtplib.SMTPException) as e:
        raise EmailSendFailed() from e
