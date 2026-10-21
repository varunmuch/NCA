"""
Password reset, email verification, and session revocation for
email/password accounts.

Tokens are random, single-use, short-lived, and stored only as SHA-256
hashes. Requests never reveal whether an email has an account.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select, update

from app.core.database import AsyncSessionLocal
from app.core.mailer import app_url, send_email
from app.db.models import AuthToken, StudentPasswordCredential
from app.services.auth_service import normalize_email
from app.services.password_auth_service import MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, hash_password


RESET = "password_reset"
VERIFY = "email_verify"

TOKEN_TTL = {
    RESET: timedelta(minutes=30),
    VERIFY: timedelta(days=2),
}

INVALID_LINK = "This link is invalid or has expired. Please request a new one."


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def _issue(db, student_id: str, purpose: str) -> str:
    # One live link per purpose: older unused ones stop working.
    await db.execute(
        update(AuthToken)
        .where(
            AuthToken.student_id == student_id,
            AuthToken.purpose == purpose,
            AuthToken.used_at.is_(None),
        )
        .values(used_at=_now())
    )

    token = secrets.token_urlsafe(32)
    db.add(
        AuthToken(
            student_id=student_id,
            purpose=purpose,
            token_hash=_hash(token),
            expires_at=_now() + TOKEN_TTL[purpose],
        )
    )

    return token


async def _consume(db, token: str, purpose: str) -> AuthToken:
    record = (
        await db.execute(
            select(AuthToken).where(
                AuthToken.token_hash == _hash(token.strip()),
                AuthToken.purpose == purpose,
            )
        )
    ).scalar_one_or_none()

    if record is None or record.used_at is not None or record.expires_at <= _now():
        raise HTTPException(status_code=400, detail={"code": "INVALID_TOKEN", "message": INVALID_LINK})

    record.used_at = _now()

    return record


async def request_password_reset(email: str) -> dict:
    normalized = normalize_email(email)

    async with AsyncSessionLocal() as db:
        credential = (
            await db.execute(
                select(StudentPasswordCredential).where(StudentPasswordCredential.email == normalized)
            )
        ).scalar_one_or_none()

        if credential is None:
            return {"status": "sent"}

        token = await _issue(db, credential.student_id, RESET)
        await db.commit()

    await send_email(
        normalized,
        "Reset your NeoCity Career Explorer password",
        (
            "Someone (hopefully you) asked to reset your Career Explorer password.\n\n"
            f"Choose a new password here (the link works for 30 minutes):\n{app_url()}/reset-password?token={token}\n\n"
            "If you didn't ask for this, you can ignore this email. Your password won't change."
        ),
    )

    return {"status": "sent"}


async def reset_password(token: str, password: str) -> dict:
    if not MIN_PASSWORD_LENGTH <= len(password) <= MAX_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be {MIN_PASSWORD_LENGTH} to {MAX_PASSWORD_LENGTH} characters.",
        )

    async with AsyncSessionLocal() as db:
        record = await _consume(db, token, RESET)
        credential = await db.get(StudentPasswordCredential, record.student_id)

        if credential is None:
            raise HTTPException(status_code=400, detail={"code": "INVALID_TOKEN", "message": INVALID_LINK})

        now = _now()
        credential.password_hash = hash_password(password)
        credential.failed_attempts = 0
        credential.locked_until = None
        credential.password_changed_at = now
        # Receiving the link proves the student owns the address.
        credential.email_verified_at = credential.email_verified_at or now

        await db.commit()

    return {"status": "reset", "email": credential.email}


async def send_verification(student_id: str) -> dict:
    async with AsyncSessionLocal() as db:
        credential = await db.get(StudentPasswordCredential, student_id)

        if credential is None or credential.email_verified_at is not None:
            return {"status": "verified"}

        token = await _issue(db, student_id, VERIFY)
        email = credential.email
        await db.commit()

    await send_email(
        email,
        "Confirm your email for NeoCity Career Explorer",
        (
            "Welcome to Career Explorer!\n\n"
            f"Confirm this is your email so you can always get back into your account:\n{app_url()}/verify-email?token={token}\n\n"
            "If you didn't create an account, you can ignore this email."
        ),
    )

    return {"status": "sent"}


async def verify_email(token: str) -> dict:
    async with AsyncSessionLocal() as db:
        record = await _consume(db, token, VERIFY)
        credential = await db.get(StudentPasswordCredential, record.student_id)

        if credential is None:
            raise HTTPException(status_code=400, detail={"code": "INVALID_TOKEN", "message": INVALID_LINK})

        credential.email_verified_at = credential.email_verified_at or _now()
        await db.commit()

    return {"status": "verified"}


async def email_status(student_id: str) -> dict:
    """Login-email verification state for /me. Google emails are verified by Google."""

    async with AsyncSessionLocal() as db:
        credential = await db.get(StudentPasswordCredential, student_id)

    if credential is None:
        return {"has_password": False, "email_verified": True}

    return {"has_password": True, "email_verified": credential.email_verified_at is not None}


def session_revoked(credential: StudentPasswordCredential | None, auth_time: int | None) -> bool:
    """True when the password changed after this session signed in."""

    if credential is None or credential.password_changed_at is None:
        return False

    if not auth_time:
        return True

    return datetime.fromtimestamp(auth_time, timezone.utc) < credential.password_changed_at - timedelta(seconds=5)
