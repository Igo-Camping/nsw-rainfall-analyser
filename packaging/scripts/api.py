from __future__ import annotations

import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from cost_engine import (
    ASSET_DIAM_COL,
    ASSET_ID_COL,
    ASSET_LEN_COL,
    CONDITION_COL,
    PROXIMITY_OPTIONS,
    get_relining_rate,
    load_relining_rates,
    resolve_suburb_column,
    split_into_packages_by_count,
    split_into_value_packages,
    split_streams,
    summarise_pipe_packages,
)


X_START_COL = "XStart"
Y_START_COL = "YStart"
X_END_COL = "XEnd"
Y_END_COL = "YEnd"
X_MID_COL = "XMid"
Y_MID_COL = "YMid"
US_NODE_COL = "SW_Upstream_Node"
DS_NODE_COL = "SW_Downstream_Node"


def _data_dir() -> Path:
    return Path(__file__).resolve().parents[1] / "data"


def _pick_existing(candidates: list[Path]) -> Path:
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return candidates[0]


def get_assets_path() -> Path:
    configured = os.getenv("PACKAGING_ASSETS_PATH", "").strip()
    if configured:
        return Path(configured)
    return _pick_existing(
        [
            _data_dir() / "assets_with_coords.csv",
            _data_dir() / "assets.csv",
        ]
    )


def get_allowed_origins() -> list[str]:
    configured = os.getenv("PACKAGING_ALLOWED_ORIGINS", "").strip()
    if configured:
        return [origin.strip() for origin in configured.split(",") if origin.strip()]
    return [
        "http://localhost",
        "http://localhost:3000",
        "http://localhost:8000",
        "http://localhost:8080",
        "http://127.0.0.1",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8000",
        "http://127.0.0.1:8080",
        "https://igo-camping.github.io",
    ]


@lru_cache(maxsize=1)
def load_assets() -> pd.DataFrame:
    return pd.read_csv(get_assets_path(), low_memory=False)


def _value_or_none(value: Any) -> Any:
    if pd.isna(value):
        return None
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            return value
    return value


def _stream_summary(name: str, df: pd.DataFrame, suburb_col: str | None) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "name": name,
        "pipe_count": int(len(df)),
        "total_length_m": 0.0,
        "sample_assets": [],
    }

    if df.empty:
        return summary

    if ASSET_LEN_COL in df.columns:
        lengths = pd.to_numeric(df[ASSET_LEN_COL], errors="coerce")
        summary["total_length_m"] = round(float(lengths.fillna(0).sum()), 1)

    if ASSET_DIAM_COL in df.columns:
        diams = pd.to_numeric(df[ASSET_DIAM_COL], errors="coerce").dropna()
        if not diams.empty:
            summary["diameter_range_mm"] = {
                "min": round(float(diams.min()), 1),
                "max": round(float(diams.max()), 1),
            }

    if suburb_col and suburb_col in df.columns:
        top_suburbs = (
            df[suburb_col]
            .fillna("Unknown")
            .astype(str)
            .value_counts()
            .head(5)
            .items()
        )
        summary["top_suburbs"] = [
            {"name": suburb, "pipe_count": int(count)}
            for suburb, count in top_suburbs
        ]

    sample_cols = [
        c
        for c in [ASSET_ID_COL, suburb_col, ASSET_DIAM_COL, ASSET_LEN_COL, CONDITION_COL]
        if c and c in df.columns
    ]
    for _, row in df[sample_cols].head(8).iterrows():
        summary["sample_assets"].append(
            {col: _value_or_none(row[col]) for col in sample_cols}
        )

    return summary


def _split_assets(relining_mode: str) -> dict[str, pd.DataFrame]:
    assets_df = load_assets()
    suburb_col = resolve_suburb_column(assets_df)

    raw_cond = (
        pd.to_numeric(
            assets_df[CONDITION_COL].astype(str).str.extract(r"(\d+)")[0],
            errors="coerce",
        )
        if CONDITION_COL in assets_df.columns
        else pd.Series(dtype=float)
    )

    rel_df, rec_df, amp_df = split_streams(assets_df)

    if relining_mode == "Condition 8 only":
        relining_df = assets_df[raw_cond == 8].copy()
    elif relining_mode == "Condition 7 only":
        relining_df = assets_df[raw_cond == 7].copy()
    else:
        relining_df = assets_df[raw_cond.isin([7, 8])].copy()

    return {
        "relining": relining_df,
        "relining_cond_8_default": rel_df,
        "reconstruction": rec_df,
        "amplification": amp_df,
        "_suburb_col": suburb_col,
        "_assets_df": assets_df,
    }


@lru_cache(maxsize=1)
def load_relining_rates_cached() -> pd.DataFrame:
    return load_relining_rates()


def _cost_relining_df(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    if df.empty:
        empty = df.copy()
        return empty, empty

    rates = load_relining_rates_cached()
    costed = df.copy()
    costed["rate_per_m"] = costed.apply(
        lambda row: get_relining_rate(
            row.get(ASSET_DIAM_COL),
            row.get(ASSET_LEN_COL),
            rates,
            mode="median",
        ),
        axis=1,
    )
    if ASSET_LEN_COL in costed.columns:
        lengths = pd.to_numeric(costed[ASSET_LEN_COL], errors="coerce")
        rates_num = pd.to_numeric(costed["rate_per_m"], errors="coerce")
        costed["pipe_cost"] = rates_num * lengths
    else:
        costed["pipe_cost"] = None

    uncosted = costed[costed["pipe_cost"].isna()].copy()
    costed = costed[costed["pipe_cost"].notna()].copy()
    return costed, uncosted


def _package_summary_rows(df: pd.DataFrame, suburb_col: str | None) -> list[dict[str, Any]]:
    if df.empty or "package_id" not in df.columns:
        return []

    summary = summarise_pipe_packages(df)
    rows: list[dict[str, Any]] = []
    for _, row in summary.head(12).iterrows():
        package_id = str(row["package_id"])
        pkg = df[df["package_id"] == package_id]
        entry: dict[str, Any] = {
            "package_id": package_id,
            "pipe_count": int(_value_or_none(row.get("pipe_count")) or 0),
            "total_length_m": round(float(_value_or_none(row.get("total_length_m")) or 0), 1),
            "total_cost": round(float(_value_or_none(row.get("total_cost")) or 0), 2),
        }
        if suburb_col and suburb_col in pkg.columns:
            entry["suburb"] = str(pkg[suburb_col].fillna("Unknown").astype(str).mode().iat[0])
        if ASSET_DIAM_COL in pkg.columns:
            diams = pd.to_numeric(pkg[ASSET_DIAM_COL], errors="coerce").dropna()
            if not diams.empty:
                entry["diameters_mm"] = sorted({int(d) for d in diams})
        rows.append(entry)
    return rows


def _coord_or_none(value: Any) -> float | None:
    val = _value_or_none(value)
    if val is None:
        return None
    try:
        f = float(val)
    except (TypeError, ValueError):
        return None
    if f != f or f in (float("inf"), float("-inf")):
        return None
    return f


_DIAMETER_LEADING_NUMBER = re.compile(r"-?\d+(?:\.\d+)?")


def _diameter_mm_or_none(value: Any) -> float | None:
    """Parse diameter values that may carry a unit suffix (e.g. ``"1050mm"``)."""
    val = _value_or_none(value)
    if val is None:
        return None
    if isinstance(val, (int, float)):
        f = float(val)
        if f != f or f in (float("inf"), float("-inf")):
            return None
        return f
    s = str(val).strip()
    if not s:
        return None
    match = _DIAMETER_LEADING_NUMBER.match(s)
    if not match:
        return None
    try:
        f = float(match.group(0))
    except (TypeError, ValueError):
        return None
    if f != f or f in (float("inf"), float("-inf")):
        return None
    return f


def _first_present(cols, *candidates: str) -> str | None:
    for c in candidates:
        if c and c in cols:
            return c
    return None


def _map_assets_payload(df: pd.DataFrame, suburb_col: str | None) -> list[dict[str, Any]]:
    if df is None or df.empty:
        return []

    cols = df.columns
    diam_col = _first_present(cols, ASSET_DIAM_COL, "SWP_Pipe_Diameter_mm")
    len_col = _first_present(cols, ASSET_LEN_COL, "Spatial_Length_m")
    asset_col = _first_present(cols, ASSET_ID_COL)
    cond_col = _first_present(cols, CONDITION_COL)
    us_col = _first_present(cols, US_NODE_COL, "SW_Upstream Node")
    ds_col = _first_present(cols, DS_NODE_COL, "SW_Downstream Node")

    rows: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        item: dict[str, Any] = {
            "asset_id": _value_or_none(row[asset_col]) if asset_col else None,
            "package_id": _value_or_none(row["package_id"]) if "package_id" in cols else None,
            "suburb": _value_or_none(row[suburb_col]) if suburb_col and suburb_col in cols else None,
            "diameter_mm": _diameter_mm_or_none(row[diam_col]) if diam_col else None,
            "length_m": _coord_or_none(row[len_col]) if len_col else None,
            "condition": _value_or_none(row[cond_col]) if cond_col else None,
            "us_node": _value_or_none(row[us_col]) if us_col else None,
            "ds_node": _value_or_none(row[ds_col]) if ds_col else None,
            "x_start": _coord_or_none(row[X_START_COL]) if X_START_COL in cols else None,
            "y_start": _coord_or_none(row[Y_START_COL]) if Y_START_COL in cols else None,
            "x_end": _coord_or_none(row[X_END_COL]) if X_END_COL in cols else None,
            "y_end": _coord_or_none(row[Y_END_COL]) if Y_END_COL in cols else None,
            "x_mid": _coord_or_none(row[X_MID_COL]) if X_MID_COL in cols else None,
            "y_mid": _coord_or_none(row[Y_MID_COL]) if Y_MID_COL in cols else None,
            "pipe_cost": _coord_or_none(row["pipe_cost"]) if "pipe_cost" in cols else None,
        }
        rows.append(item)
    return rows


def _sample_package_assets(df: pd.DataFrame, suburb_col: str | None) -> list[dict[str, Any]]:
    if df.empty or "package_id" not in df.columns:
        return []

    first_package_id = str(sorted(df["package_id"].astype(str).unique())[0])
    package_df = df[df["package_id"].astype(str) == first_package_id].copy()
    sample_cols = [
        c
        for c in ["package_id", ASSET_ID_COL, suburb_col, ASSET_DIAM_COL, ASSET_LEN_COL, "pipe_cost"]
        if c and c in package_df.columns
    ]
    rows: list[dict[str, Any]] = []
    for _, row in package_df[sample_cols].head(12).iterrows():
        item = {col: _value_or_none(row[col]) for col in sample_cols}
        if "pipe_cost" in item and item["pipe_cost"] is not None:
            item["pipe_cost"] = round(float(item["pipe_cost"]), 2)
        rows.append(item)
    return rows


class SplitPreviewRequest(BaseModel):
    relining_mode: str = "Condition 7 and 8"


class GenerateReliningPackagesRequest(BaseModel):
    relining_mode: str = "Condition 7 and 8"
    package_method: str = "value"
    max_package_value: float = 500000.0
    pipes_per_package: int = 25
    group_by_suburb: bool = True


app = FastAPI(title="Stormwater Packaging API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, Any]:
    assets_df = load_assets()
    relining_rates_path = _data_dir() / "Panel_Rates.xlsx"
    return {
        "ok": True,
        "service": "stormwater-packaging-api",
        "assets_loaded": int(len(assets_df)),
        "assets_path": str(get_assets_path()),
        "rates_path": str(relining_rates_path),
        "has_coordinates": all(
            col in assets_df.columns for col in ["XMid", "YMid"]
        ),
    }


@app.get("/packaging/config")
def packaging_config() -> dict[str, Any]:
    assets_df = load_assets()
    suburb_col = resolve_suburb_column(assets_df)
    return {
        "ok": True,
        "assets_path": str(get_assets_path()),
        "asset_count": int(len(assets_df)),
        "suburb_column": suburb_col,
        "proximity_options_m": PROXIMITY_OPTIONS,
        "relining_modes": [
            "Condition 8 only",
            "Condition 7 only",
            "Condition 7 and 8",
        ],
    }


@app.post("/packaging/split-streams")
def packaging_split_streams(payload: SplitPreviewRequest) -> dict[str, Any]:
    split = _split_assets(payload.relining_mode)
    assets_df = split["_assets_df"]
    suburb_col = split["_suburb_col"]

    return {
        "ok": True,
        "relining_mode": payload.relining_mode,
        "asset_count": int(len(assets_df)),
        "suburb_column": suburb_col,
        "streams": [
            _stream_summary("Relining Preview", split["relining"], suburb_col),
            _stream_summary(
                "Relining Default (Condition 8)", split["relining_cond_8_default"], suburb_col
            ),
            _stream_summary("Reconstruction", split["reconstruction"], suburb_col),
            _stream_summary("Amplification", split["amplification"], suburb_col),
        ],
        "map_assets": {
            "relining": _map_assets_payload(split["relining"], suburb_col),
        },
    }


@app.post("/packaging/generate-relining-packages")
def packaging_generate_relining_packages(
    payload: GenerateReliningPackagesRequest,
) -> dict[str, Any]:
    split = _split_assets(payload.relining_mode)
    relining_df = split["relining"]
    suburb_col = split["_suburb_col"]
    costed, uncosted = _cost_relining_df(relining_df)

    group_cols: list[str] = []
    if payload.group_by_suburb and suburb_col and suburb_col in costed.columns:
        group_cols.append(suburb_col)

    method = (payload.package_method or "value").strip().lower()
    if method == "count":
        packaged = split_into_packages_by_count(
            costed,
            pipes_per_package=max(int(payload.pipes_per_package), 1),
            group_cols=group_cols,
            prefix="RLN_",
        )
    else:
        packaged = split_into_value_packages(
            costed,
            max_package_value=max(float(payload.max_package_value), 1.0),
            group_cols=group_cols,
            prefix="RLN_",
            cost_col="pipe_cost",
        )
        method = "value"

    package_count = (
        int(packaged["package_id"].nunique()) if not packaged.empty and "package_id" in packaged.columns else 0
    )
    total_cost = (
        round(float(pd.to_numeric(packaged["pipe_cost"], errors="coerce").fillna(0).sum()), 2)
        if not packaged.empty and "pipe_cost" in packaged.columns
        else 0.0
    )
    total_length = (
        round(float(pd.to_numeric(packaged[ASSET_LEN_COL], errors="coerce").fillna(0).sum()), 1)
        if not packaged.empty and ASSET_LEN_COL in packaged.columns
        else 0.0
    )

    return {
        "ok": True,
        "relining_mode": payload.relining_mode,
        "package_method": method,
        "group_by_suburb": bool(group_cols),
        "costed_pipe_count": int(len(costed)),
        "uncosted_pipe_count": int(len(uncosted)),
        "package_count": package_count,
        "total_length_m": total_length,
        "total_cost": total_cost,
        "packages": _package_summary_rows(packaged, suburb_col),
        "sample_assets": _sample_package_assets(packaged, suburb_col),
        "map_assets": _map_assets_payload(packaged, suburb_col),
    }
