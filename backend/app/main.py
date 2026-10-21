import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.api.staff_routes import router as staff_router
from app.api.student_routes import router as student_router
from app.core.config import get_allowed_origins
from app.core.security import require_auth_bridge
from app.services import account_service
from app.services.auth_service import bootstrap_google_identity
from app.services.document_service import resume_interrupted
from app.services.llm_service import check_llm
from app.services.password_auth_service import (
    bootstrap_password_identity,
    link_google_to_password,
    login_with_password,
    signup_with_password,
)


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)


class GoogleAuthBootstrapRequest(BaseModel):
    provider: str
    provider_subject: str
    email: str
    name: str = ""


class PasswordSignupRequest(BaseModel):
    email: str
    password: str
    name: str


class PasswordLoginRequest(BaseModel):
    email: str
    password: str


class GoogleLinkPasswordRequest(BaseModel):
    provider_subject: str
    email: str
    name: str = ""
    password: str


class PasswordBootstrapRequest(BaseModel):
    student_id: str
    auth_time: int | None = None


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


class VerifyEmailRequest(BaseModel):
    token: str


allowed_origins = get_allowed_origins()

if not allowed_origins:
    raise RuntimeError(
        "CIE_ALLOWED_ORIGINS is not configured. "
        "At least one allowed frontend origin is required."
    )


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Keep a reference so the task isn't garbage-collected mid-run.
    resume = asyncio.create_task(resume_interrupted())
    yield
    resume.cancel()


app = FastAPI(
    title="Career Intelligence Engine",
    version="0.2.0",
    lifespan=lifespan,
)


# Browsers do not call this API directly (the Next.js server proxies every
# request with the bridge secret), so CORS stays limited to the frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=[
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS",
    ],
    allow_headers=[
        "Content-Type",
        "Authorization",
    ],
)


app.include_router(student_router)
app.include_router(staff_router)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "cie-backend",
    }


@app.get("/health/llm")
async def health_llm():
    return await check_llm()


@app.post("/api/v1/auth/google/bootstrap")
async def google_auth_bootstrap(
    request: GoogleAuthBootstrapRequest,
    x_cie_auth_bridge: str | None = Header(
        default=None
    ),
):
    require_auth_bridge(
        x_cie_auth_bridge
    )

    if request.provider != "google":
        raise HTTPException(
            status_code=400,
            detail="Unsupported authentication provider.",
        )

    provider_subject = (
        request.provider_subject.strip()
    )

    email = (
        request.email.strip().lower()
    )

    name = (
        request.name.strip()
    )

    if not provider_subject:
        raise HTTPException(
            status_code=400,
            detail="Provider subject is required.",
        )

    if not email:
        raise HTTPException(
            status_code=400,
            detail="Email is required.",
        )

    return await bootstrap_google_identity(
        provider="google",
        provider_subject=provider_subject,
        email=email,
        name=name,
    )


@app.post("/api/v1/auth/password/signup")
async def password_signup(
    request: PasswordSignupRequest,
    x_cie_auth_bridge: str | None = Header(
        default=None
    ),
):
    require_auth_bridge(
        x_cie_auth_bridge
    )

    created = await signup_with_password(
        email=request.email,
        password=request.password,
        name=request.name,
    )

    await account_service.send_verification(created["student_id"])

    return created


@app.post("/api/v1/auth/password/login")
async def password_login(
    request: PasswordLoginRequest,
    x_cie_auth_bridge: str | None = Header(
        default=None
    ),
):
    require_auth_bridge(
        x_cie_auth_bridge
    )

    return await login_with_password(
        email=request.email,
        password=request.password,
    )


@app.post("/api/v1/auth/password/bootstrap")
async def password_bootstrap(
    request: PasswordBootstrapRequest,
    x_cie_auth_bridge: str | None = Header(
        default=None
    ),
):
    require_auth_bridge(
        x_cie_auth_bridge
    )

    return await bootstrap_password_identity(
        student_id=request.student_id.strip(),
        auth_time=request.auth_time,
    )


@app.post("/api/v1/auth/password/forgot")
async def password_forgot(
    request: ForgotPasswordRequest,
    x_cie_auth_bridge: str | None = Header(
        default=None
    ),
):
    require_auth_bridge(
        x_cie_auth_bridge
    )

    return await account_service.request_password_reset(request.email)


@app.post("/api/v1/auth/password/reset")
async def password_reset(
    request: ResetPasswordRequest,
    x_cie_auth_bridge: str | None = Header(
        default=None
    ),
):
    require_auth_bridge(
        x_cie_auth_bridge
    )

    return await account_service.reset_password(request.token, request.password)


@app.post("/api/v1/auth/email/verify")
async def email_verify(
    request: VerifyEmailRequest,
    x_cie_auth_bridge: str | None = Header(
        default=None
    ),
):
    require_auth_bridge(
        x_cie_auth_bridge
    )

    return await account_service.verify_email(request.token)


@app.post("/api/v1/auth/google/link-password")
async def google_link_password(
    request: GoogleLinkPasswordRequest,
    x_cie_auth_bridge: str | None = Header(
        default=None
    ),
):
    require_auth_bridge(
        x_cie_auth_bridge
    )

    return await link_google_to_password(
        provider_subject=request.provider_subject,
        email=request.email,
        name=request.name,
        password=request.password,
    )
