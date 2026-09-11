from pathlib import Path
import yaml


CONFIG_PATH = (
    Path(__file__).resolve().parents[2]
    / "config"
    / "model_config.yaml"
)


def load_config() -> dict:
    with open(CONFIG_PATH, "r", encoding="utf-8") as file:
        return yaml.safe_load(file)


config = load_config()
