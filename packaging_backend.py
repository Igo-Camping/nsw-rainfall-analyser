from __future__ import annotations

import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import openpyxl
import pandas as pd
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/packaging", tags=["packaging"])

ASSET_ID_COL = "Asset"
ASSET_DIAM_COL = "SWP_Pipe Diameter_mm"
ASSET_LEN_COL = "Spatial Length_m"
CONDITION_COL = "SW_Condition"
SUBURB_COL = "Asset Suburb"
PROXIMITY_OPTIONS = [250, 500, 1000, 2000, 3000]
PANEL_RATES_FILENAME = "Panel_Rates.xlsx"
PANEL_RATES_SHEET = "_Tables"


def _data_dir() -> Path:
    configured = os.getenv("PACKAGING_DATA_DIR", "").strip()
    if configured:
        return Path(configured).expanduser()
    return Path(__file__).resolve().parent / "packaging_data"


def _outputs_dir() -> Path:
    configured = os.getenv("PACKAGING_OUTPUTS_DIR", "").strip()
    if configured:
        return Path(configured).expanduser()
    return Path(__file__).resolve().parent / "packaging_outputs"


def _pick_existing(candidates: list[Path]) -> Path:
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return candidates[0]


def _assets_path() -> Path:
    configured = os.getenv("PACKAGING_ASSETS_PATH", "").strip()
    if configured:
        return Path(configured).expanduser()
    return _pick_existing([
        _data_dir() / "assets_with_coords.csv",
        _data_dir() / "assets.csv",
    ])


def _rates_path() -> Path:
    configured = os.getenv("PACKAGING_RATES_PATH", "").strip()
    if configured:
        return Path(configured).expanduser()
    return _data_dir() / PANEL_RATES_FILENAME


@lru_cache(maxsize=1)
def load_assets() -> pd.DataFrame:
    return pd.read_csv(_assets_path(), low_memory=False)


def _clean_rate_df(df: pd.DataFrame) -> pd.DataFrame:
    if "Unit Rate" in df.columns:
        df["Unit Rate"] = (
            df["Unit Rate"].astype(str).str.replace(r"[$,]", "", regex=True).str.strip()
        )
        df["Unit Rate"] = pd.to_numeric(df["Unit Rate"], errors="coerce")
    return df


def _load_panel_rates(path: Path) -> pd.DataFrame:
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb[PANEL_RATES_SHEET]
    rows = list(ws.iter_rows(values_only=True))
    df = pd.DataFrame(rows[1:], columns=rows[0])
    return _clean_rate_df(df)


@lru_cache(maxsize=1)
def load_relining_rates() -> pd.DataFrame:
    df = _load_panel_rates(_rates_path())
    mask = df["Category"].astype(str).str.contains("SP6 Pipeline Relining", na=False)
    return df[mask].reset_index(drop=True)


def resolve_suburb_column(df: pd.DataFrame) -> str | None:
    for candidate in [SUBURB_COL, "Location - Suburb", "Asset Suburb", "Suburb", "SUBURB"]:
        if candidate in df.columns:
            return candidate
    return None


def parse_diameter_from_descriptor(desc: str) -> float | None:
    if not isinstance(desc, str):
        return None
    match = re.search(r"[ØO]?(\d+)", desc)
    return float(match.group(1)) if match else None


def parse_all_diameters(desc: str) -> list[float]:
    if not isinstance(desc, str):
        return []
    mm_matches = re.findall(r"[ØO]?(\d+)\s*mm", desc)
    if mm_matches:
        return [float(d) for d in mm_matches if 50 <= float(d) <= 3000]
    symbol_matches = re.findall(r"[ØO](\d+)", desc)
    if symbol_matches:
        return [float(d) for d in symbol_matches if 50 <= float(d) <= 3000]
    if re.search(r"relining|connection", desc, flags=re.IGNORECASE):
        generic_matches = re.findall(r"(\d{2,4})", desc)
        if generic_matches:
            return [float(d) for d in generic_matches if 50 <= float(d) <= 3000][:1]
    return []


def parse_number_value(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)) and pd.notna(value):
        return float(value)
    match = re.search(r"-?\d+(\.\d+)?", str(value).replace(",", ""))
    return float(match.group(0)) if match else None


def parse_length_band(desc: str) -> tuple[float, float] | None:
    if not isinstance(desc, str):
        return None
    plus_match = re.search(r"\+(\d+)", desc)
    if plus_match:
        return (float(plus_match.group(1)), float("inf"))
    range_match = re.search(r"(\d+)\s*-\s*(\d+)", desc)
    if range_match:
        return (float(range_match.group(1)), float(range_match.group(2)))
    return None


def lookup_sp6_rate(diameter: float, length_m: float, rates: pd.DataFrame, mode: str = "median") -> float | None:
    if rates is None or rates.empty:
        return None

    df = rates.copy()
    df["parsed_diam"] = df["Size/Descriptor"].apply(parse_diameter_from_descriptor)
    df["parsed_all_diams"] = df["Size/Descriptor"].apply(parse_all_diameters)
    df["parsed_band"] = df["Size/Descriptor"].apply(parse_length_band)

    target = parse_number_value(diameter)
    length_value = parse_number_value(length_m)
    if target is None or length_value is None:
        return None
    subset = df[
        df["parsed_all_diams"].apply(lambda diams: target in diams if diams else False)
        | (df["parsed_diam"] == target)
    ]
    if subset.empty:
        return None

    def length_in_band(band: tuple[float, float] | None) -> bool:
        if band is None:
            return False
        low, high = band
        return (length_value >= low) and (length_value <= high)

    band_filtered = subset[subset["parsed_band"].apply(length_in_band)]
    if band_filtered.empty:
        if subset["parsed_band"].notna().any():
            return None
    else:
        subset = band_filtered

    if "Asset Class" in subset.columns:
        median_subset = subset[subset["Asset Class"].astype(str).str.contains("Median", na=False)]
        if not median_subset.empty:
            subset = median_subset
        elif mode == "median":
            panel_subset = subset[subset["Asset Class"].astype(str).str.contains("Panel", na=False)]
            if not panel_subset.empty:
                subset = panel_subset

    if "Unit Rate" not in subset.columns:
        return None
    return float(subset["Unit Rate"].median())


def get_relining_rate(diameter: float, length_m: float, rates: pd.DataFrame, mode: str = "median") -> float | None:
    return lookup_sp6_rate(diameter, length_m, rates, mode)


def condition_number_series(df: pd.DataFrame) -> pd.Series:
    candidates = [
        CONDITION_COL,
        "Observed_Condition",
        "Observed Condition",
        "Calculated_Condition",
        "Calculated Condition",
        "Schedule7_Condition",
        "Schedule_7_Condition",
        "Schedule 7 Condition",
        "Condition",
    ]
    result = pd.Series(pd.NA, index=df.index, dtype="Float64")
    for col in candidates:
        if col not in df.columns:
            continue
        text = df[col].astype(str).str.strip()
        numeric = pd.to_numeric(text.where(text.str.fullmatch(r"\d+(\.\d+)?", na=False)), errors="coerce")
        condition_text = pd.to_numeric(text.str.extract(r"\bcondition\s*(\d+)\b", flags=re.IGNORECASE)[0], errors="coerce")
        compact_text = pd.to_numeric(text.str.extract(r"\bcond\.?\s*(\d+)\b", flags=re.IGNORECASE)[0], errors="coerce")
        parsed = numeric.combine_first(condition_text).combine_first(compact_text)
        result = result.combine_first(parsed.astype("Float64"))
    return result


def split_streams(assets_df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    df = assets_df.copy()
    cond = condition_number_series(df)
    if cond.isna().all():
        empty = df.iloc[0:0].copy()
        return empty, empty, df
    rel_df = df[cond == 8].copy()
    rec_df = df[cond.isin([9, 10])].copy()

    flood_col = "SW LGA 20% H1-H6"
    amp_conditions = [4, 5, 6, 7]
    amp_hazards = ["H3", "H4", "H5", "H6"]
    amp_min_diam = 300.0
    amp_cond_mask = cond.isin(amp_conditions)
    if flood_col in df.columns:
        flood = df[flood_col].astype(str).str.strip().str.upper()
        amp_flood_mask = flood.isin(amp_hazards)
    else:
        amp_flood_mask = pd.Series(False, index=df.index)
    if ASSET_DIAM_COL in df.columns:
        diam = pd.to_numeric(df[ASSET_DIAM_COL], errors="coerce")
        amp_diam_mask = diam >= amp_min_diam
    else:
        amp_diam_mask = pd.Series(False, index=df.index)
    amp_df = df[amp_cond_mask & amp_flood_mask & amp_diam_mask].copy()
    return rel_df, rec_df, amp_df


def split_into_packages_by_count(df: pd.DataFrame, pipes_per_package: int, group_cols: list[str] | None = None, prefix: str = "PKG_") -> pd.DataFrame:
    group_cols = group_cols or []
    work = df.copy()
    if ASSET_ID_COL in work.columns:
        work[ASSET_ID_COL] = work[ASSET_ID_COL].astype(str)
    if group_cols:
        work = work.sort_values(group_cols)

    package_ids: list[int] = []
    pkg_idx = 0
    count_in_pkg = 0
    last_group_key = None
    for _, row in work.iterrows():
        group_key = tuple(row[c] for c in group_cols) if group_cols else None
        if last_group_key is None:
            last_group_key = group_key
        if group_key != last_group_key:
            pkg_idx += 1
            count_in_pkg = 0
            last_group_key = group_key
        if count_in_pkg >= pipes_per_package:
            pkg_idx += 1
            count_in_pkg = 0
        package_ids.append(pkg_idx)
        count_in_pkg += 1

    work["package_id"] = [f"{prefix}{i + 1:03d}" for i in package_ids]
    return work


def split_into_value_packages(df: pd.DataFrame, max_package_value: float, group_cols: list[str] | None = None, prefix: str = "PKG_", cost_col: str = "pipe_cost") -> pd.DataFrame:
    group_cols = group_cols or []
    if cost_col not in df.columns:
        raise ValueError(f"Missing cost column '{cost_col}' for value-based packaging.")
    work = df.copy()
    if ASSET_ID_COL in work.columns:
        work[ASSET_ID_COL] = work[ASSET_ID_COL].astype(str)

    grouped = work.groupby(group_cols, dropna=False) if group_cols else [(None, work)]
    all_packages: list[dict[str, Any]] = []
    pkg_counter = 1
    for _, group in grouped:
        group = group.sort_values(cost_col, ascending=False)
        current_pkg: list[dict[str, Any]] = []
        current_value = 0.0
        for _, row in group.iterrows():
            pipe_value = float(row[cost_col])
            if current_pkg and (current_value + pipe_value > max_package_value):
                for item in current_pkg:
                    item["package_id"] = f"{prefix}{pkg_counter:03d}"
                    all_packages.append(item)
                pkg_counter += 1
                current_pkg = []
                current_value = 0.0
            current_pkg.append(row.to_dict())
            current_value += pipe_value
        if current_pkg:
            for item in current_pkg:
                item["package_id"] = f"{prefix}{pkg_counter:03d}"
                all_packages.append(item)
            pkg_counter += 1
    return pd.DataFrame(all_packages)


def summarise_pipe_packages(df: pd.DataFrame) -> pd.DataFrame:
    if "package_id" not in df.columns:
        return pd.DataFrame()
    agg: dict[str, str] = {ASSET_ID_COL: "count"}
    if ASSET_LEN_COL in df.columns:
        agg[ASSET_LEN_COL] = "sum"
    if "pipe_cost" in df.columns:
        agg["pipe_cost"] = "sum"
    summary = df.groupby("package_id", dropna=False).agg(agg).reset_index()
    return summary.rename(columns={
        ASSET_ID_COL: "pipe_count",
        ASSET_LEN_COL: "total_length_m",
        "pipe_cost": "total_cost",
    })


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
    summary: dict[str, Any] = {"name": name, "pipe_count": int(len(df)), "total_length_m": 0.0, "sample_assets": []}
    if df.empty:
        return summary
    if ASSET_LEN_COL in df.columns:
        lengths = pd.to_numeric(df[ASSET_LEN_COL], errors="coerce")
        summary["total_length_m"] = round(float(lengths.fillna(0).sum()), 1)
    sample_cols = [c for c in [ASSET_ID_COL, suburb_col, ASSET_DIAM_COL, ASSET_LEN_COL, CONDITION_COL] if c and c in df.columns]
    for _, row in df[sample_cols].head(8).iterrows():
        summary["sample_assets"].append({col: _value_or_none(row[col]) for col in sample_cols})
    return summary


def _cost_relining_df(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    if df.empty:
        empty = df.copy()
        return empty, empty
    rates = load_relining_rates()
    costed = df.copy()
    costed["rate_per_m"] = costed.apply(
        lambda row: get_relining_rate(row.get(ASSET_DIAM_COL), row.get(ASSET_LEN_COL), rates, mode="median"),
        axis=1,
    )
    lengths = costed[ASSET_LEN_COL].apply(parse_number_value) if ASSET_LEN_COL in costed.columns else pd.Series(index=costed.index, dtype=float)
    rates_num = pd.to_numeric(costed["rate_per_m"], errors="coerce")
    costed["pipe_cost"] = rates_num * lengths
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
        if suburb_col and suburb_col in pkg.columns and not pkg.empty:
            entry["suburb"] = str(pkg[suburb_col].fillna("Unknown").astype(str).mode().iat[0])
        rows.append(entry)
    return rows


def _sample_package_assets(df: pd.DataFrame, suburb_col: str | None) -> list[dict[str, Any]]:
    if df.empty or "package_id" not in df.columns:
        return []
    first_package_id = str(sorted(df["package_id"].astype(str).unique())[0])
    package_df = df[df["package_id"].astype(str) == first_package_id].copy()
    sample_cols = [c for c in ["package_id", ASSET_ID_COL, suburb_col, ASSET_DIAM_COL, ASSET_LEN_COL, "pipe_cost"] if c and c in package_df.columns]
    rows: list[dict[str, Any]] = []
    for _, row in package_df[sample_cols].head(12).iterrows():
        item = {col: _value_or_none(row[col]) for col in sample_cols}
        if item.get("pipe_cost") is not None:
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


@router.get("/health")
def packaging_health() -> dict[str, Any]:
    assets_df = load_assets()
    return {
        "ok": True,
        "service": "stormwater-packaging-api",
        "assets_loaded": int(len(assets_df)),
        "assets_path": str(_assets_path()),
        "rates_path": str(_rates_path()),
        "outputs_path": str(_outputs_dir()),
        "has_coordinates": all(col in assets_df.columns for col in ["XMid", "YMid"]),
    }


@router.get("/config")
def packaging_config() -> dict[str, Any]:
    assets_df = load_assets()
    return {
        "ok": True,
        "assets_path": str(_assets_path()),
        "asset_count": int(len(assets_df)),
        "suburb_column": resolve_suburb_column(assets_df),
        "data_path": str(_data_dir()),
        "outputs_path": str(_outputs_dir()),
        "proximity_options_m": PROXIMITY_OPTIONS,
        "relining_modes": ["Condition 8 only", "Condition 7 only", "Condition 7 and 8"],
    }


@router.post("/split-streams")
def packaging_split_streams(payload: SplitPreviewRequest) -> dict[str, Any]:
    assets_df = load_assets()
    suburb_col = resolve_suburb_column(assets_df)
    rel_df, rec_df, amp_df = split_streams(assets_df)

    raw_cond = condition_number_series(assets_df)

    if payload.relining_mode == "Condition 8 only":
        relining_df = assets_df[raw_cond == 8].copy()
    elif payload.relining_mode == "Condition 7 only":
        relining_df = assets_df[raw_cond == 7].copy()
    else:
        relining_df = assets_df[raw_cond.isin([7, 8])].copy()

    return {
        "ok": True,
        "relining_mode": payload.relining_mode,
        "asset_count": int(len(assets_df)),
        "suburb_column": suburb_col,
        "data_path": str(_data_dir()),
        "outputs_path": str(_outputs_dir()),
        "streams": [
            _stream_summary("Relining Preview", relining_df, suburb_col),
            _stream_summary("Relining Default (Condition 8)", rel_df, suburb_col),
            _stream_summary("Reconstruction", rec_df, suburb_col),
            _stream_summary("Amplification", amp_df, suburb_col),
        ],
    }


@router.post("/generate-relining-packages")
def packaging_generate_relining_packages(payload: GenerateReliningPackagesRequest) -> dict[str, Any]:
    preview = packaging_split_streams(SplitPreviewRequest(relining_mode=payload.relining_mode))
    assets_df = load_assets()
    suburb_col = preview["suburb_column"]
    raw_cond = condition_number_series(assets_df)

    if payload.relining_mode == "Condition 8 only":
        relining_df = assets_df[raw_cond == 8].copy()
    elif payload.relining_mode == "Condition 7 only":
        relining_df = assets_df[raw_cond == 7].copy()
    else:
        relining_df = assets_df[raw_cond.isin([7, 8])].copy()

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

    total_length = pd.to_numeric(packaged.get(ASSET_LEN_COL), errors="coerce").fillna(0).sum() if not packaged.empty and ASSET_LEN_COL in packaged.columns else 0
    total_cost = pd.to_numeric(packaged.get("pipe_cost"), errors="coerce").fillna(0).sum() if not packaged.empty and "pipe_cost" in packaged.columns else 0
    return {
        "ok": True,
        "relining_mode": payload.relining_mode,
        "package_method": method,
        "package_count": int(packaged["package_id"].nunique()) if not packaged.empty else 0,
        "costed_pipe_count": int(len(costed)),
        "uncosted_pipe_count": int(len(uncosted)),
        "total_length_m": round(float(total_length), 1),
        "total_cost": round(float(total_cost), 2),
        "packages": _package_summary_rows(packaged, suburb_col),
        "sample_assets": _sample_package_assets(packaged, suburb_col),
        "data_path": str(_data_dir()),
        "outputs_path": str(_outputs_dir()),
    }
