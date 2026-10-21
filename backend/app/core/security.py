"""
Authenticated student resolution for student-owned endpoints.

The browser never talks to FastAPI directly. The Next.js server verifies
the Auth.js session, then forwards the request with:

- X-CIE-Auth-Bridge: the shared bridge secret
- X-CIE-Provider:    "google" or "password"
- X-CIE-Subject:     the provider's stable subject from the session

The student ID is resolved here from the identity tables, so a student ID
sent by a client is never trusted.
"""

from secrets import compare_digest

from fastapi import Header, HTTPException
from sqlalchemy import select

from app.core.config import get_required_env
from app.core.database import AsyncSessionLocal
from app.db.models import (
    StudentAuthIdentity,
    StudentPasswordCredential,
)
from app.services.account_service import session_revoked


def require_auth_bridge(
    x_cie_auth_bridge: str | None,
) -> None:
    """
    Only the Next.js server holds the bridge secret, so requests that
    carry it cannot originate from a browser.
    """

    expected_secret = get_required_env(
        "CIE_AUTH_BRIDGE_SECRET"
    )

    if not x_cie_auth_bridge:
        raise HTTPException(
            status_code=401,
            detail="Missing authentication bridge credentials.",
        )

    if not compare_digest(
        x_cie_auth_bridge,
        expected_secret,
    ):
        raise HTTPException(
            status_code=401,
            detail="Unauthorized authentication bridge request.",
        )


def parse_auth_time(value: str | None) -> int | None:
    try:
        return int(value) if value else None
    except ValueError:
        return None


async def current_student_id(
    x_cie_auth_bridge: str | None = Header(default=None),
    x_cie_provider: str | None = Header(default=None),
    x_cie_subject: str | None = Header(default=None),
    x_cie_auth_time: str | None = Header(default=None),
) -> str:
    require_auth_bridge(x_cie_auth_bridge)

    provider = (x_cie_provider or "").strip()
    subject = (x_cie_subject or "").strip()

    if not provider or not subject:
        raise HTTPException(
            status_code=401,
            detail="Missing student identity.",
        )

    async with AsyncSessionLocal() as db:
        if provider == "password":
            # Password accounts use the CIE student ID as their subject.
            credential = await db.get(StudentPasswordCredential, subject)

            if session_revoked(credential, parse_auth_time(x_cie_auth_time)):
                raise HTTPException(
                    status_code=401,
                    detail="Your password was changed. Please sign in again.",
                )

            result = await db.execute(
                select(StudentPasswordCredential.student_id).where(
                    StudentPasswordCredential.student_id == subject
                )
            )
        elif provider == "google":
            result = await db.execute(
                select(StudentAuthIdentity.student_id).where(
                    StudentAuthIdentity.provider == "google",
                    StudentAuthIdentity.provider_subject == subject,
                )
            )
        else:
            raise HTTPException(
                status_code=401,
                detail="Unsupported identity provider.",
            )

        student_id = result.scalar_one_or_none()

    if student_id is None:
        raise HTTPException(
            status_code=401,
            detail="This account is not linked to a student yet.",
        )

    return student_id
