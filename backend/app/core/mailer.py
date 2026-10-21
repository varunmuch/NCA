"""
Outgoing email over SMTP.

Configure in backend/.env:
  CIE_SMTP_HOST, CIE_SMTP_PORT (default 587), CIE_SMTP_USERNAME,
  CIE_SMTP_PASSWORD, CIE_SMTP_FROM, CIE_SMTP_STARTTLS (default true)
  CIE_APP_URL  public address of the website, used in links

Without CIE_SMTP_HOST (local development) the message is written to the
server log instead, so the flows can still be tested.
"""

import asyncio
import logging
import os
import smtplib
from email.message import EmailMessage


logger = logging.getLogger("cie.mail")


def app_url() -> str:
    return os.getenv("CIE_APP_URL", "http://localhost:3001").rstrip("/")


def email_configured() -> bool:
    return bool(os.getenv("CIE_SMTP_HOST"))


def _send_sync(message: EmailMessage) -> None:
    host = os.environ["CIE_SMTP_HOST"]
    port = int(os.getenv("CIE_SMTP_PORT", "587"))
    username = os.getenv("CIE_SMTP_USERNAME", "")
    password = os.getenv("CIE_SMTP_PASSWORD", "")

    with smtplib.SMTP(host, port, timeout=20) as smtp:
        if os.getenv("CIE_SMTP_STARTTLS", "true").lower() != "false":
            smtp.starttls()

        if username:
            smtp.login(username, password)

        smtp.send_message(message)


async def send_email(to: str, subject: str, body: str) -> None:
    if not email_configured():
        logger.warning(
            "Email is not configured (CIE_SMTP_HOST). Message for %s:\n%s\n%s",
            to,
            subject,
            body,
        )
        return

    message = EmailMessage()
    message["From"] = os.getenv("CIE_SMTP_FROM") or os.getenv("CIE_SMTP_USERNAME", "")
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    try:
        await asyncio.to_thread(_send_sync, message)
    except (OSError, smtplib.SMTPException):
        # Never reveal delivery problems to the requester; log for staff.
        logger.exception("Sending email to %s failed", to)
