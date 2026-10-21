import base64
import hashlib
import hmac
import os
import re
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.database import AsyncSessionLocal
from app.db.models import (
    Student,
    StudentAuthIdentity,
    StudentMemory,
    StudentPasswordCredential,
    StudentProfileMemory,
)
from app.services.auth_service import (
    create_initial_profile,
    ensure_profile_shape,
    normalize_email,
)


PASSWORD_PROVIDER = "password"

MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 128
MAX_NAME_LENGTH = 100

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION = timedelta(minutes=15)

# scrypt cost parameters (about 16 MB of memory per hash).
SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_DKLEN = 32

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

INVALID_LOGIN_MESSAGE = "Incorrect email or password."


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def hash_password(password: str) -> str:
    salt = os.urandom(16)

    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=SCRYPT_DKLEN,
    )

    return (
        f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}$"
        f"{_b64(salt)}${_b64(derived)}"
    )


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, n, r, p, salt_b64, hash_b64 = stored_hash.split("$")
    except ValueError:
        return False

    if algorithm != "scrypt":
        return False

    expected = base64.b64decode(hash_b64)

    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=base64.b64decode(salt_b64),
        n=int(n),
        r=int(r),
        p=int(p),
        dklen=len(expected),
    )

    return hmac.compare_digest(derived, expected)


# Used when the email is unknown so a failed login takes about as long
# as a wrong password, and response timing does not reveal accounts.
_DUMMY_HASH = hash_password(os.urandom(16).hex())


def validate_signup(
    email: str,
    password: str,
    name: str,
) -> None:
    if not EMAIL_PATTERN.match(email) or len(email) > 320:
        raise HTTPException(
            status_code=400,
            detail="Please enter a valid email address.",
        )

    if not name:
        raise HTTPException(
            status_code=400,
            detail="Please enter your name.",
        )

    if len(name) > MAX_NAME_LENGTH:
        raise HTTPException(
            status_code=400,
            detail="Name is too long.",
        )

    if len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Password must be at least "
                f"{MIN_PASSWORD_LENGTH} characters."
            ),
        )

    if len(password) > MAX_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Password must be at most "
                f"{MAX_PASSWORD_LENGTH} characters."
            ),
        )


async def signup_with_password(
    email: str,
    password: str,
    name: str,
) -> dict:
    normalized_email = normalize_email(email)
    normalized_name = name.strip()

    validate_signup(
        normalized_email,
        password,
        normalized_name,
    )

    async with AsyncSessionLocal() as db:
        #
        # One account per email, whichever way it was created.
        #
        existing_result = await db.execute(
            select(StudentAuthIdentity).where(
                StudentAuthIdentity.email == normalized_email,
            )
        )

        existing_identities = list(
            existing_result.scalars().all()
        )

        if existing_identities:
            uses_google = any(
                identity.provider == "google"
                for identity in existing_identities
            )

            raise HTTPException(
                status_code=409,
                detail={
                    "code": "EMAIL_IN_USE",
                    "message": (
                        "An account with this email already exists. "
                        + (
                            "Try \"Continue with Google\" instead."
                            if uses_google
                            else "Try signing in instead."
                        )
                    ),
                },
            )

        student_id = str(uuid4())

        db.add(Student(id=student_id))

        db.add(
            StudentProfileMemory(
                student_id=student_id,
                profile_json=create_initial_profile(
                    normalized_name,
                    normalized_email,
                ),
            )
        )

        db.add(
            StudentMemory(
                student_id=student_id,
                summary="",
            )
        )

        #
        # The identity row keeps password accounts out of the
        # legacy email-linking used by Google sign-in.
        #
        db.add(
            StudentAuthIdentity(
                student_id=student_id,
                provider=PASSWORD_PROVIDER,
                provider_subject=student_id,
                email=normalized_email,
                name=normalized_name,
            )
        )

        db.add(
            StudentPasswordCredential(
                student_id=student_id,
                email=normalized_email,
                password_hash=hash_password(password),
                failed_attempts=0,
            )
        )

        try:
            await db.commit()
        except IntegrityError as exc:
            # Another sign-up with the same email won the race.
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "EMAIL_IN_USE",
                    "message": (
                        "An account with this email already exists. "
                        "Try signing in instead."
                    ),
                },
            ) from exc

    return {
        "status": "created",
        "student_id": student_id,
        "email": normalized_email,
        "name": normalized_name,
    }


async def login_with_password(
    email: str,
    password: str,
) -> dict:
    normalized_email = normalize_email(email)

    if not normalized_email or not password or len(password) > MAX_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=401,
            detail={"code": "INVALID_LOGIN", "message": INVALID_LOGIN_MESSAGE},
        )

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(StudentPasswordCredential).where(
                StudentPasswordCredential.email == normalized_email,
            )
        )

        credential = result.scalar_one_or_none()

        if credential is None:
            verify_password(password, _DUMMY_HASH)

            raise HTTPException(
                status_code=401,
                detail={"code": "INVALID_LOGIN", "message": INVALID_LOGIN_MESSAGE},
            )

        now = utc_now()

        if credential.locked_until is not None and credential.locked_until > now:
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "ACCOUNT_LOCKED",
                    "message": (
                        "Too many wrong passwords. "
                        "Please wait 15 minutes and try again."
                    ),
                },
            )

        if not verify_password(password, credential.password_hash):
            credential.failed_attempts = (credential.failed_attempts or 0) + 1

            if credential.failed_attempts >= MAX_FAILED_ATTEMPTS:
                credential.locked_until = now + LOCKOUT_DURATION
                credential.failed_attempts = 0

            await db.commit()

            raise HTTPException(
                status_code=401,
                detail={"code": "INVALID_LOGIN", "message": INVALID_LOGIN_MESSAGE},
            )

        credential.failed_attempts = 0
        credential.locked_until = None

        identity_result = await db.execute(
            select(StudentAuthIdentity).where(
                StudentAuthIdentity.provider == PASSWORD_PROVIDER,
                StudentAuthIdentity.provider_subject == credential.student_id,
            )
        )

        identity = identity_result.scalar_one_or_none()

        name = ""

        if identity is not None:
            identity.last_login_at = now
            name = identity.name

        await db.commit()

        return {
            "status": "success",
            "student_id": credential.student_id,
            "email": credential.email,
            "name": name,
        }


async def bootstrap_password_identity(
    student_id: str,
    auth_time: int | None = None,
) -> dict:
    async with AsyncSessionLocal() as db:
        credential_result = await db.execute(
            select(StudentPasswordCredential).where(
                StudentPasswordCredential.student_id == student_id,
            )
        )

        credential = credential_result.scalar_one_or_none()

        # Imported here: account_service imports this module.
        from app.services.account_service import session_revoked

        if session_revoked(credential, auth_time):
            raise HTTPException(
                status_code=401,
                detail={
                    "code": "SESSION_REVOKED",
                    "message": "Your password was changed. Please sign in again.",
                },
            )

        if credential is None:
            raise HTTPException(
                status_code=401,
                detail={
                    "code": "UNKNOWN_ACCOUNT",
                    "message": "This account no longer exists. Please sign up again.",
                },
            )

        profile_result = await db.execute(
            select(StudentProfileMemory).where(
                StudentProfileMemory.student_id == student_id,
            )
        )

        profile_record = profile_result.scalar_one_or_none()

        if profile_record is None:
            profile_record = StudentProfileMemory(
                student_id=student_id,
                profile_json=create_initial_profile(
                    "",
                    credential.email,
                ),
            )

            db.add(profile_record)
        else:
            profile_record.profile_json = ensure_profile_shape(
                profile_record.profile_json,
                credential.email,
                "",
            )

        await db.commit()

        return {
            "status": "existing",
            "student_id": student_id,
            "profile": profile_record.profile_json,
            "identity": {
                "provider": PASSWORD_PROVIDER,
                "email": credential.email,
            },
        }


async def link_google_to_password(
    provider_subject: str,
    email: str,
    name: str,
    password: str,
) -> dict:
    """
    Attach a verified Google sign-in to the password account with the same
    email, after the student proves they own it with its password.
    """

    normalized_email = normalize_email(email)
    subject = provider_subject.strip()

    if not subject or not normalized_email:
        raise HTTPException(status_code=400, detail="Missing Google account details.")

    # Same checks, lockout, and timing as a normal password sign-in.
    login = await login_with_password(normalized_email, password)
    student_id = login["student_id"]

    async with AsyncSessionLocal() as db:
        existing = (
            await db.execute(
                select(StudentAuthIdentity).where(
                    StudentAuthIdentity.provider == "google",
                    StudentAuthIdentity.provider_subject == subject,
                )
            )
        ).scalar_one_or_none()

        if existing is not None and existing.student_id != student_id:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "GOOGLE_ALREADY_LINKED",
                    "message": "This Google account is already connected to a different account.",
                },
            )

        if existing is None:
            db.add(
                StudentAuthIdentity(
                    student_id=student_id,
                    provider="google",
                    provider_subject=subject,
                    email=normalized_email,
                    name=name.strip()[:255],
                )
            )
            await db.commit()

    return {"status": "linked", "student_id": student_id}
