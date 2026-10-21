from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func, select

from app.core.database import AsyncSessionLocal
from app.db.models import (
    Student,
    StudentAuthIdentity,
    StudentMemory,
    StudentPasswordCredential,
    StudentProfileMemory,
)


def normalize_email(
    email: str,
) -> str:
    return email.strip().lower()


def create_initial_profile(
    name: str,
    email: str,
) -> dict:
    """
    Google supplies the initial display name and authenticated email.

    The profile name becomes student-managed after account creation.
    """

    cleaned_name = name.strip()

    return {
        "name": (
            cleaned_name
            if cleaned_name
            else email.split("@")[0]
        ),
        "email": email,
        "current_education": "",
        "interests": [],
        "hobbies": [],
        "career_aspiration": "",
        "skills": [],
        "years_of_experience": 0,
        "additional_context": "",
    }


def ensure_profile_shape(
    current_profile: dict | None,
    email: str,
    fallback_name: str,
) -> dict:
    """
    Preserve student-editable profile information.

    Authentication is authoritative for email.
    Google name is used only when the profile has no name yet.
    """

    profile = dict(
        current_profile or {}
    )

    existing_name = str(
        profile.get("name") or ""
    ).strip()

    if not existing_name:
        cleaned_fallback_name = (
            fallback_name.strip()
        )

        profile["name"] = (
            cleaned_fallback_name
            if cleaned_fallback_name
            else email.split("@")[0]
        )

    # Authenticated provider owns the login email.
    profile["email"] = email

    profile.setdefault(
        "current_education",
        "",
    )

    profile.setdefault(
        "interests",
        [],
    )

    profile.setdefault(
        "hobbies",
        [],
    )

    profile.setdefault(
        "career_aspiration",
        "",
    )

    profile.setdefault(
        "skills",
        [],
    )

    profile.setdefault(
        "years_of_experience",
        0,
    )

    profile.setdefault(
        "additional_context",
        "",
    )

    return profile


async def bootstrap_google_identity(
    provider: str,
    provider_subject: str,
    email: str,
    name: str,
) -> dict:
    normalized_email = normalize_email(
        email
    )

    normalized_subject = (
        provider_subject.strip()
    )

    normalized_name = (
        name.strip()
    )

    if provider != "google":
        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported authentication provider."
            ),
        )

    if not normalized_subject:
        raise HTTPException(
            status_code=400,
            detail=(
                "Google provider subject is required."
            ),
        )

    if not normalized_email:
        raise HTTPException(
            status_code=400,
            detail=(
                "Google email address is required."
            ),
        )

    async with AsyncSessionLocal() as db:

        #
        # 1. Returning authenticated user.
        #
        identity_result = await db.execute(
            select(
                StudentAuthIdentity
            ).where(
                StudentAuthIdentity.provider
                == provider,

                StudentAuthIdentity.provider_subject
                == normalized_subject,
            )
        )

        existing_identity = (
            identity_result.scalar_one_or_none()
        )

        if existing_identity is not None:

            #
            # Authentication information may change.
            #
            existing_identity.email = (
                normalized_email
            )

            existing_identity.name = (
                normalized_name
            )

            existing_identity.last_login_at = (
                datetime.utcnow()
            )


            profile_result = await db.execute(
                select(
                    StudentProfileMemory
                ).where(
                    StudentProfileMemory.student_id
                    == existing_identity.student_id
                )
            )

            profile_record = (
                profile_result.scalar_one_or_none()
            )


            if profile_record is None:

                profile_record = (
                    StudentProfileMemory(
                        student_id=(
                            existing_identity.student_id
                        ),

                        profile_json=(
                            create_initial_profile(
                                normalized_name,
                                normalized_email,
                            )
                        ),
                    )
                )

                db.add(
                    profile_record
                )

            else:

                #
                # IMPORTANT:
                #
                # Preserve student-managed name.
                #
                # Google must not overwrite:
                #
                # Venky Addala
                #
                # with:
                #
                # Venkatesh Addala
                #
                # during every login.
                #
                profile_record.profile_json = (
                    ensure_profile_shape(
                        profile_record.profile_json,
                        normalized_email,
                        normalized_name,
                    )
                )


            await db.commit()


            return {
                "status": "existing",

                "student_id":
                    existing_identity.student_id,

                "profile":
                    profile_record.profile_json,

                "identity": {
                    "provider": "google",
                    "email": normalized_email,
                },
            }


        #
        # 2. First Google login for an email that already has a password
        # account. Password emails are never verified, so the student
        # proves ownership with that password once (see
        # link_google_to_password) instead of getting a second account.
        #
        password_owner = (
            await db.execute(
                select(StudentPasswordCredential).where(
                    StudentPasswordCredential.email == normalized_email,
                )
            )
        ).scalar_one_or_none()

        # Both Google and the password account have proven this address,
        # so they are the same person: link without asking.
        if password_owner is not None and password_owner.email_verified_at is not None:
            db.add(
                StudentAuthIdentity(
                    student_id=password_owner.student_id,
                    provider="google",
                    provider_subject=normalized_subject,
                    email=normalized_email,
                    name=normalized_name,
                )
            )
            await db.commit()

            return {
                "status": "linked_password",
                "student_id": password_owner.student_id,
                "identity": {"provider": "google", "email": normalized_email},
            }

        if password_owner is not None:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "LINK_PASSWORD_REQUIRED",
                    "message": (
                        "You already have an account with this email. "
                        "Enter its password once to connect Google to it."
                    ),
                },
            )

        #
        # 3. First login.
        #
        # Search for a legacy profile using the
        # authenticated Google email.
        #
        legacy_profile_result = await db.execute(
            select(
                StudentProfileMemory
            ).where(
                func.lower(
                    StudentProfileMemory
                    .profile_json["email"]
                    .astext
                )
                == normalized_email,

                # Only pre-authentication legacy profiles may be linked.
                # Students that already have a sign-in method (for example
                # an unverified email/password account) are never claimed
                # by email match.
                StudentProfileMemory.student_id.not_in(
                    select(
                        StudentAuthIdentity.student_id
                    )
                ),
            )
        )

        email_matches = list(
            legacy_profile_result
            .scalars()
            .all()
        )


        #
        # 3. No legacy profile.
        #
        # Create new student.
        #
        if len(email_matches) == 0:

            student_id = str(
                uuid4()
            )

            student = Student(
                id=student_id,
            )

            profile_record = (
                StudentProfileMemory(
                    student_id=student_id,

                    profile_json=(
                        create_initial_profile(
                            normalized_name,
                            normalized_email,
                        )
                    ),
                )
            )

            memory_record = (
                StudentMemory(
                    student_id=student_id,
                    summary="",
                )
            )

            identity = (
                StudentAuthIdentity(
                    student_id=student_id,

                    provider="google",

                    provider_subject=(
                        normalized_subject
                    ),

                    email=(
                        normalized_email
                    ),

                    name=(
                        normalized_name
                    ),
                )
            )


            db.add(
                student
            )

            db.add(
                profile_record
            )

            db.add(
                memory_record
            )

            db.add(
                identity
            )


            await db.commit()


            return {
                "status": "created",

                "student_id":
                    student_id,

                "profile":
                    profile_record.profile_json,

                "identity": {
                    "provider": "google",
                    "email": normalized_email,
                },
            }


        #
        # 4. Multiple profiles share email.
        #
        # Never guess which account owns the data.
        #
        if len(email_matches) > 1:

            raise HTTPException(
                status_code=409,

                detail={
                    "code":
                        "AMBIGUOUS_LEGACY_ACCOUNT",

                    "message": (
                        "Multiple existing student "
                        "profiles use this email address. "
                        "Automatic account linking was "
                        "stopped for safety."
                    ),
                },
            )


        #
        # 5. Exactly one legacy profile matched.
        #
        legacy_profile = (
            email_matches[0]
        )

        legacy_student_id = (
            legacy_profile.student_id
        )


        #
        # Check whether an authenticated identity
        # already owns this student.
        #
        existing_auth_result = await db.execute(
            select(
                StudentAuthIdentity
            ).where(
                StudentAuthIdentity.student_id
                == legacy_student_id
            )
        )

        existing_auth_identities = list(
            existing_auth_result
            .scalars()
            .all()
        )


        if existing_auth_identities:

            raise HTTPException(
                status_code=409,

                detail={
                    "code":
                        "ACCOUNT_LINK_REQUIRED",

                    "message": (
                        "An existing authenticated "
                        "account already owns the "
                        "student profile associated "
                        "with this email address."
                    ),
                },
            )


        #
        # Verify student exists.
        #
        student_result = await db.execute(
            select(
                Student
            ).where(
                Student.id
                == legacy_student_id
            )
        )

        student = (
            student_result.scalar_one_or_none()
        )

        if student is None:

            raise HTTPException(
                status_code=409,

                detail={
                    "code":
                        "INVALID_LEGACY_ACCOUNT",

                    "message": (
                        "A legacy profile was found "
                        "without a corresponding "
                        "student record."
                    ),
                },
            )


        #
        # Make sure student memory exists.
        #
        memory_result = await db.execute(
            select(
                StudentMemory
            ).where(
                StudentMemory.student_id
                == legacy_student_id
            )
        )

        memory = (
            memory_result.scalar_one_or_none()
        )

        if memory is None:

            db.add(
                StudentMemory(
                    student_id=(
                        legacy_student_id
                    ),

                    summary="",
                )
            )


        #
        # Link Google identity.
        #
        identity = (
            StudentAuthIdentity(
                student_id=(
                    legacy_student_id
                ),

                provider="google",

                provider_subject=(
                    normalized_subject
                ),

                email=(
                    normalized_email
                ),

                name=(
                    normalized_name
                ),
            )
        )

        db.add(
            identity
        )


        #
        # Preserve existing legacy profile.
        #
        legacy_profile.profile_json = (
            ensure_profile_shape(
                legacy_profile.profile_json,
                normalized_email,
                normalized_name,
            )
        )


        await db.commit()


        return {
            "status":
                "linked_legacy",

            "student_id":
                legacy_student_id,

            "profile":
                legacy_profile.profile_json,

            "identity": {
                "provider":
                    "google",

                "email":
                    normalized_email,
            },

            "message": (
                "Existing student profile linked "
                "to the authenticated Google account."
            ),
        }
