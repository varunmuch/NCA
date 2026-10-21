import os
from pathlib import Path

import yaml
from dotenv import load_dotenv


BACKEND_ROOT = Path(__file__).resolve().parents[2]

ENV_PATH = BACKEND_ROOT / ".env"

CONFIG_PATH = (
    BACKEND_ROOT
    / "config"
    / "model_config.yaml"
)


load_dotenv(ENV_PATH)


def load_config() -> dict:
    with open(
        CONFIG_PATH,
        "r",
        encoding="utf-8",
    ) as file:
        return yaml.safe_load(file)


config = load_config()


def get_required_env(name: str) -> str:
    value = os.getenv(name)

    if not value:
        raise RuntimeError(
            f"Required environment variable "
            f"'{name}' is not configured."
        )

    return value


def get_optional_env(
    name: str,
    default: str = "",
) -> str:
    return os.getenv(
        name,
        default,
    )


def get_allowed_origins() -> list[str]:
    raw_value = os.getenv(
        "CIE_ALLOWED_ORIGINS",
        "",
    )

    origins = [
        item.strip()
        for item in raw_value.split(",")
        if item.strip()
    ]

    return origins
