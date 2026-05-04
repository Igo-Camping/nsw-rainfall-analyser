from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any


CONFIG_ENV = "PACKAGING_CONFIG_PATH"
DEFAULT_CONFIG_NAME = "packaging_config.json"
DEFAULT_SHARED_SEGMENTS = [
    "OneDrive - Northern Beaches Council",
    "Stormwater Engineering - General",
    "Stormwater Tool",
]
DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost",
    "http://localhost:3000",
    "http://localhost:8000",
    "http://localhost:8080",
    "http://127.0.0.1",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8000",
    "http://127.0.0.1:8080",
    "https://experience.arcgis.com",
]


def _script_dir() -> Path:
    return Path(__file__).resolve().parent


def _repo_root() -> Path:
    return _script_dir().parent


def _config_path() -> Path:
    configured = os.getenv(CONFIG_ENV, "").strip()
    if configured:
        return Path(configured).expanduser()
    return _script_dir() / DEFAULT_CONFIG_NAME


@lru_cache(maxsize=1)
def load_config() -> dict[str, Any]:
    path = _config_path()
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8-sig"))


def _config_value(key: str) -> Any:
    return load_config().get(key)


def _configured_path(key: str) -> Path | None:
    value = _config_value(key)
    if not value:
        return None
    return Path(str(value)).expanduser()


def get_shared_root() -> Path:
    configured = _configured_path("shared_root")
    if configured:
        return configured

    env_value = os.getenv("PACKAGING_SHARED_ROOT", "").strip()
    if env_value:
        return Path(env_value).expanduser()

    one_drive = os.getenv("OneDriveCommercial", "").strip()
    if one_drive:
        return Path(one_drive).joinpath("Stormwater Engineering - General", "Stormwater Tool")

    default_root = Path.home().joinpath(*DEFAULT_SHARED_SEGMENTS)
    if default_root.is_dir():
        return default_root

    return _repo_root()


def get_data_dir() -> Path:
    configured = _configured_path("data_dir")
    if configured:
        return configured

    candidates = [
        get_shared_root() / "Data",
        get_shared_root() / "data",
        _repo_root() / "Data",
        _repo_root() / "data",
    ]
    for candidate in candidates:
        if candidate.is_dir():
            return candidate
    return candidates[0]


def get_outputs_dir() -> Path:
    configured = _configured_path("outputs_dir")
    if configured:
        return configured

    candidates = [
        get_shared_root() / "Outputs",
        get_shared_root() / "outputs",
        _repo_root() / "Outputs",
        _repo_root() / "outputs",
    ]
    for candidate in candidates:
        if candidate.is_dir():
            return candidate
    return candidates[0]


def get_assets_path() -> Path:
    configured = _configured_path("assets_path")
    if configured:
        return configured

    candidates = [
        get_data_dir() / "assets_with_coords.csv",
        get_data_dir() / "assets.csv",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return candidates[0]


def get_panel_rates_path() -> Path:
    configured = _configured_path("panel_rates_path")
    if configured:
        return configured
    return get_data_dir() / "Panel_Rates.xlsx"


def get_allowed_origins() -> list[str]:
    configured = _config_value("allowed_origins")
    if isinstance(configured, list) and configured:
        return [str(origin).strip() for origin in configured if str(origin).strip()]

    env_value = os.getenv("PACKAGING_ALLOWED_ORIGINS", "").strip()
    if env_value:
        return [origin.strip() for origin in env_value.split(",") if origin.strip()]

    return DEFAULT_ALLOWED_ORIGINS.copy()


def get_bind_host() -> str:
    value = _config_value("bind_host")
    return str(value).strip() if value else "0.0.0.0"


def get_bind_port() -> int:
    value = _config_value("bind_port")
    try:
        return int(value)
    except (TypeError, ValueError):
        return 8001
