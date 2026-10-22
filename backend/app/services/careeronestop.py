"""
CareerOneStop Web API (U.S. Department of Labor): occupation search and
details, which carry O*NET data (description, tasks, skills, knowledge,
interests, education, related occupations).

Credentials: CIE_CAREERONESTOP_USER_ID and CIE_CAREERONESTOP_TOKEN in
backend/.env. Only a job title leaves the server, never student details.
"""

import os
from urllib.parse import quote

import httpx
from dotenv import load_dotenv


BASE = "https://api.careeronestop.org/v1/occupation"
CERT_BASE = "https://api.careeronestop.org/v1/certificationfinder"
TIMEOUT_SECONDS = 20

DETAIL_FLAGS = (
    "training=true&interest=true&tasks=true&skills=true&knowledge=true"
    "&alternateOnetTitles=true&relatedOnetTitles=true&enableMetaData=false"
)


class CareerOneStopError(Exception):
    """The API is unreachable, not configured, or returned something unusable."""


def _credentials() -> tuple[str, str]:
    load_dotenv()
    user = os.getenv("CIE_CAREERONESTOP_USER_ID", "")
    token = os.getenv("CIE_CAREERONESTOP_TOKEN", "")

    if not user or not token:
        raise CareerOneStopError("CareerOneStop credentials are not set.")

    return user, token


async def _get(path: str, base: str = BASE) -> dict:
    user, token = _credentials()

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            response = await client.get(
                f"{base}/{user}/{path}",
                headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            )
    except httpx.HTTPError as exc:
        raise CareerOneStopError(f"CareerOneStop request failed: {exc}") from exc

    if response.status_code == 404:
        return {}

    if response.status_code != 200:
        raise CareerOneStopError(f"CareerOneStop answered {response.status_code}.")

    return response.json()


async def search(keyword: str, limit: int = 10) -> list[dict]:
    """Occupations matching a job title: [{"code", "title"}], best first."""

    data = await _get(f"{quote(keyword)}/0/0/{limit}")

    return [
        {"code": item["OnetCode"], "title": item["OnetTitle"]}
        for item in data.get("OccupationList") or []
        if item.get("OnetCode") and item.get("OnetTitle")
    ]


async def details(onet_code: str) -> dict | None:
    """Full O*NET details for one occupation (Florida context), or None."""

    data = await _get(f"{quote(onet_code)}/FL?{DETAIL_FLAGS}")
    found = data.get("OccupationDetail") or []
    return found[0] if found else None


async def certifications(onet_code: str, limit: int = 30) -> list[dict]:
    """Certifications CareerOneStop lists for an occupation code."""

    # Path: keyword, then nine filters (0 = any), then the record limit.
    data = await _get(f"{quote(onet_code)}/0/0/0/0/0/0/0/0/0/{limit}", base=CERT_BASE)

    return [item for item in data.get("CertList") or [] if item.get("Id") and item.get("Name")]


VIDEO_FILE = "https://cdn.careeronestop.org/OccVids/OccupationVideos/{code}.mp4"


async def videos(onet_code: str) -> list[dict]:
    """
    Short official career videos (U.S. Department of Labor) for an
    occupation: [{"code", "title", "mp4", "page"}].
    """

    data = await _get(f"{quote(onet_code)}/US?videos=true")
    found = (data.get("OccupationDetail") or [{}])[0]
    page = found.get("COSVideoURL") or ""

    return [
        {
            "code": item["VideoCode"],
            "title": item.get("VideoTitle") or found.get("OnetTitle", ""),
            "mp4": VIDEO_FILE.format(code=item["VideoCode"]),
            "page": page,
        }
        for item in found.get("Video") or []
        if item.get("VideoCode")
    ]
