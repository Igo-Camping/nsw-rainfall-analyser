# cost_engine.py

import pandas as pd
import numpy as np
import re
import sys
import os


DEFAULT_SHARED_SEGMENTS = (
    "OneDrive - Northern Beaches Council",
    "Stormwater Engineering - General",
    "Pipe Relining",
)


def get_shared_root() -> str:
    configured = os.getenv("PACKAGING_SHARED_ROOT", "").strip()
    if configured:
        return os.path.normpath(os.path.expanduser(configured))

    default_root = os.path.join(os.path.expanduser("~"), *DEFAULT_SHARED_SEGMENTS)
    if os.path.isdir(default_root):
        return os.path.normpath(default_root)

    if getattr(sys, "frozen", False):
        return os.path.normpath(sys._MEIPASS)

    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.normpath(os.path.join(here, ".."))


def get_data_dir() -> str:
    """Returns the current input data directory for the packaging tool."""
    shared_data = os.path.join(get_shared_root(), "Data")
    if os.path.isdir(shared_data):
        return os.path.normpath(shared_data)

    if getattr(sys, "frozen", False):
        candidate = os.path.join(sys._MEIPASS, "data")
        if os.path.isdir(candidate):
            return os.path.normpath(candidate)

    here = os.path.dirname(os.path.abspath(__file__))
    candidate = os.path.join(here, "..", "data")
    if os.path.isdir(candidate):
        return os.path.normpath(candidate)
    return os.path.normpath(os.path.join(here, "data"))


def get_outputs_dir() -> str:
    return os.path.normpath(os.path.join(get_shared_root(), "Outputs"))

# ---------------------------------------------------------
# COLUMN CONSTANTS (MATCHING YOUR REAL ASSET FILE)
# ---------------------------------------------------------

ASSET_ID_COL = "Asset"
ASSET_DIAM_COL = "SWP_Pipe Diameter_mm"
ASSET_LEN_COL = "Spatial Length_m"
CONDITION_COL = "SW_Condition"
SUBURB_COL = "Asset Suburb"
X_MID_COL = "XMid"
Y_MID_COL = "YMid"

# Proximity clustering options (metres)
PROXIMITY_OPTIONS = [250, 500, 1000, 2000, 3000]


def normalize_asset_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Rename underscore column names from the CSV to the space-separated names used internally."""
    rename_map = {
        "Spatial_Length_m": "Spatial Length_m",
        "SWP_Pipe_Diameter_mm": "SWP_Pipe Diameter_mm",
    }
    return df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns})


def _extract_condition_scores(df: pd.DataFrame) -> pd.Series:
    """Extract numeric condition scores (1-10).
    Prefers Observed_Condition (explicit numeric column) when present and valid.
    Falls back to regex extraction from SW_Condition for older datasets.
    """
    if "Observed_Condition" in df.columns:
        obs = pd.to_numeric(df["Observed_Condition"], errors="coerce")
        if obs.notna().any():
            return obs
    if CONDITION_COL in df.columns:
        return pd.to_numeric(
            df[CONDITION_COL].astype(str).str.extract(r"(\d+)")[0],
            errors="coerce",
        )
    return pd.Series(dtype=float, index=df.index)


# ---------------------------------------------------------
# RATE LOADING
# ---------------------------------------------------------

def _clean_rate_df(df: pd.DataFrame) -> pd.DataFrame:
    """Strip currency symbols and commas from Unit Rate so it can be used numerically."""
    if "Unit Rate" in df.columns:
        df["Unit Rate"] = (
            df["Unit Rate"]
            .astype(str)
            .str.replace(r"[$,]", "", regex=True)
            .str.strip()
        )
        df["Unit Rate"] = pd.to_numeric(df["Unit Rate"], errors="coerce")
    return df


PANEL_RATES_FILENAME = "Panel_Rates.xlsx"
PANEL_RATES_SHEET = "_Tables"


def _load_panel_rates(path: str) -> pd.DataFrame:
    """Load the _Tables sheet from Panel_Rates.xlsx into a DataFrame."""
    import openpyxl
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb[PANEL_RATES_SHEET]
    rows = list(ws.iter_rows(values_only=True))
    df = pd.DataFrame(rows[1:], columns=rows[0])
    return _clean_rate_df(df)


def load_relining_rates(path: str | None = None) -> pd.DataFrame:
    if path is None:
        path = os.path.join(get_data_dir(), PANEL_RATES_FILENAME)
    df = _load_panel_rates(path)
    mask = df["Category"].astype(str).str.contains("SP6 Pipeline Relining", na=False)
    return df[mask].reset_index(drop=True)


def load_reconstruction_rates(path: str | None = None) -> pd.DataFrame:
    if path is None:
        path = os.path.join(get_data_dir(), PANEL_RATES_FILENAME)
    df = _load_panel_rates(path)
    mask = df["Category"].astype(str).str.contains("SP7 Drainage Construction", na=False)
    return df[mask].reset_index(drop=True)

# ---------------------------------------------------------
# SUBURB RESOLUTION
# ---------------------------------------------------------

def resolve_suburb_column(df: pd.DataFrame) -> str | None:
    candidates = [
        SUBURB_COL,
        "Location - Suburb",
        "Asset Suburb",
        "Suburb",
        "SUBURB",
    ]
    for c in candidates:
        if c in df.columns:
            return c
    return None

# ---------------------------------------------------------
# PARSING HELPERS FOR SP6 RATE TABLES
# ---------------------------------------------------------

def parse_diameter_from_descriptor(desc: str) -> float | None:
    """Returns the FIRST diameter found. Use parse_all_diameters for multi-diameter rows."""
    if not isinstance(desc, str):
        return None
    m = re.search(r"[Ã˜O]?(\d+)", desc)
    return float(m.group(1)) if m else None


def parse_all_diameters(desc: str) -> list[float]:
    """Returns all diameters mentioned in a descriptor (handles ranges like '375mm and 450mm')."""
    if not isinstance(desc, str):
        return []
    # Find all numbers that look like pipe diameters (100-2000mm range)
    matches = re.findall(r"[Ã˜O]?(\d+)\s*mm", desc)
    if matches:
        return [float(d) for d in matches if 50 <= float(d) <= 3000]
    # Fall back to Ã˜-prefixed numbers (e.g. "Ã˜375")
    matches = re.findall(r"[Ã˜O](\d+)", desc)
    if matches:
        return [float(d) for d in matches if 50 <= float(d) <= 3000]
    return []


def parse_length_band(desc: str) -> tuple[float, float] | None:
    if not isinstance(desc, str):
        return None

    m_plus = re.search(r"\+(\d+)", desc)
    if m_plus:
        lower = float(m_plus.group(1))
        return (lower, float("inf"))

    m_range = re.search(r"(\d+)\s*-\s*(\d+)", desc)
    if m_range:
        return (float(m_range.group(1)), float(m_range.group(2)))

    return None

# ---------------------------------------------------------
# RATE LOOKUP FOR SP6 RELINING / RECONSTRUCTION
# ---------------------------------------------------------

def lookup_sp6_rate(diameter: float,
                    length_m: float,
                    rates: pd.DataFrame,
                    mode: str = "median",
                    vendor: str | None = None) -> float | None:
    """
    Returns the matched unit rate, or None if no match is found.
    Callers should handle None (e.g. flag pipe as uncosted) rather
    than silently treating it as zero.
    """
    if rates is None or rates.empty:
        return None

    df = rates.copy()

    df["parsed_diam"] = df["Size/Descriptor"].apply(parse_diameter_from_descriptor)
    df["parsed_all_diams"] = df["Size/Descriptor"].apply(parse_all_diameters)
    df["parsed_band"] = df["Size/Descriptor"].apply(parse_length_band)

    # Match rows where the target diameter appears in the descriptor.
    # For single-diameter rows (e.g. "Ã˜375"), parsed_diam suffices.
    # For multi-diameter rows (e.g. "375mm and 450mm Class 2 RRJ RCP"),
    # check if diameter appears in the full list.
    target = float(diameter)
    subset = df[
        df["parsed_all_diams"].apply(lambda diams: target in diams if diams else False) |
        (df["parsed_diam"] == target)
    ]
    if subset.empty:
        return None

    def length_in_band(band):
        if band is None:
            return False
        low, high = band
        # FIX: use inclusive upper bound (<=) so a pipe at exactly the
        # band ceiling matches rather than falling through to no match.
        return (length_m >= low) and (length_m <= high)

    band_filtered = subset[subset["parsed_band"].apply(length_in_band)]

    # If no rows have length bands at all (e.g. reconstruction rates are flat
    # rate by diameter only with no length banding), skip the length filter
    # and use all rows for this diameter.
    if band_filtered.empty:
        has_any_bands = subset["parsed_band"].notna().any()
        if has_any_bands:
            # Bands exist but none matched this length â€” genuine no-match
            return None
        # No bands in the data at all â€” flat rate per diameter, proceed
    else:
        subset = band_filtered

    if mode == "vendor" and vendor is not None:
        # Filter to individual contractor rows only
        if "Asset Class" in subset.columns:
            contractor_subset = subset[subset["Asset Class"].astype(str).str.contains("Panel", na=False)]
            if not contractor_subset.empty:
                subset = contractor_subset
        vendor_col = "Component" if "Component" in subset.columns else "Origin of Average/Mean Price"
        vendor_subset = subset[subset[vendor_col].astype(str).str.strip() == str(vendor).strip()]
        if not vendor_subset.empty:
            subset = vendor_subset
    elif mode == "median":
        # Prefer pre-computed median rows if available
        if "Asset Class" in subset.columns:
            median_subset = subset[subset["Asset Class"].astype(str).str.contains("Median", na=False)]
            if not median_subset.empty:
                subset = median_subset
            else:
                # Fall back to computing median across contractor rows
                panel_subset = subset[subset["Asset Class"].astype(str).str.contains("Panel", na=False)]
                if not panel_subset.empty:
                    subset = panel_subset
    elif mode == "lowest":
        # Use contractor rows only for lowest price
        if "Asset Class" in subset.columns:
            panel_subset = subset[subset["Asset Class"].astype(str).str.contains("Panel", na=False)]
            if not panel_subset.empty:
                subset = panel_subset

    if "Unit Rate" not in subset.columns:
        return None

    if mode == "lowest":
        return float(subset["Unit Rate"].min())
    else:
        return float(subset["Unit Rate"].median())

# ---------------------------------------------------------
# PUBLIC RATE LOOKUP FUNCTIONS
# ---------------------------------------------------------

def get_relining_rate(diameter, length, rates, mode="median", vendor=None):
    return lookup_sp6_rate(diameter, length, rates, mode, vendor)


def get_reconstruction_rate(diameter, length, rates, mode="median", vendor=None):
    return lookup_sp6_rate(diameter, length, rates, mode, vendor)


# ---------------------------------------------------------
# RECONSTRUCTION FULL COST BREAKDOWN
# ---------------------------------------------------------

# Soil density in tonnes per mÂ³ for waste/demolition weight calculation
SOIL_DENSITY_T_M3 = 1.8

# Default pipe class for reconstruction
DEFAULT_PIPE_CLASS = "RCP Class 4"


def _get_sp7_median_rate(rates: pd.DataFrame, item_name: str, size_descriptor: str | None = None) -> float | None:
    """
    Look up a single median rate from the SP7 table by Item name.
    Optionally filter by size_descriptor for tiered/sized items.
    Returns the rate or None if not found.
    """
    if rates is None or rates.empty:
        return None

    df = rates.copy()
    # Use median rows preferentially
    if "Asset Class" in df.columns:
        med = df[df["Asset Class"].astype(str).str.contains("Median", na=False)]
        if not med.empty:
            df = med

    mask = df["Item"].astype(str).str.strip().str.lower() == item_name.strip().lower()
    subset = df[mask]

    if size_descriptor and not subset.empty:
        size_mask = subset["Size/Descriptor"].astype(str).str.strip().str.lower() == size_descriptor.strip().lower()
        sized = subset[size_mask]
        if not sized.empty:
            subset = sized

    if subset.empty or "Unit Rate" not in subset.columns:
        return None

    return float(subset["Unit Rate"].median())


def _get_tiered_rate(rates: pd.DataFrame, item_name: str, volume_m3: float) -> float | None:
    """
    Look up a tiered rate (e.g. excavation, backfill) based on volume in mÂ³.
    Finds the band row whose Size/Descriptor matches the volume.
    """
    if rates is None or rates.empty:
        return None

    df = rates.copy()
    if "Asset Class" in df.columns:
        med = df[df["Asset Class"].astype(str).str.contains("Median", na=False)]
        if not med.empty:
            df = med

    mask = df["Item"].astype(str).str.strip().str.lower() == item_name.strip().lower()
    subset = df[mask].copy()
    if subset.empty:
        return None

    # Parse quantity bands from Size/Descriptor
    # e.g. "Quantity less than 2mÂ³", "Quantity 2 to 5mÂ³", "Quantity over 500mÂ³"
    def band_matches(desc: str, vol: float) -> bool:
        desc = str(desc).lower()
        # "less than X"
        m = re.search(r"less than\s+([\d.]+)", desc)
        if m:
            return vol < float(m.group(1))
        # "X to YmÂ³" or "X to Y mÂ³"
        m = re.search(r"([\d.]+)\s+to\s+([\d.]+)", desc)
        if m:
            return float(m.group(1)) <= vol <= float(m.group(2))
        # "over X"
        m = re.search(r"over\s+([\d.]+)", desc)
        if m:
            return vol > float(m.group(1))
        return False

    matched = subset[subset["Size/Descriptor"].apply(lambda d: band_matches(str(d), volume_m3))]
    if matched.empty:
        # Fall back to smallest band
        matched = subset.head(1)

    return float(matched["Unit Rate"].median())


def _get_pipe_rate(rates: pd.DataFrame, diameter: float, pipe_class: str = DEFAULT_PIPE_CLASS) -> float | None:
    """Look up the pipe supply rate for a given diameter and class."""
    if rates is None or rates.empty:
        return None

    df = rates.copy()
    if "Asset Class" in df.columns:
        med = df[df["Asset Class"].astype(str).str.contains("Median", na=False)]
        if not med.empty:
            df = med

    mask = df["Item"].astype(str).str.strip().str.lower() == "stormwater pipe"
    subset = df[mask]

    # Filter by pipe class
    if "Type" in subset.columns and pipe_class:
        class_mask = subset["Type"].astype(str).str.strip().str.lower() == pipe_class.strip().lower()
        class_sub = subset[class_mask]
        if not class_sub.empty:
            subset = class_sub

    # Filter by diameter
    if "Size/Descriptor" in subset.columns:
        diam_str = f"Ã˜{int(diameter)}"
        diam_mask = subset["Size/Descriptor"].astype(str).str.strip() == diam_str
        diam_sub = subset[diam_mask]
        if not diam_sub.empty:
            return float(diam_sub["Unit Rate"].median())

    return None


def calc_reconstruction_cost(
    diameter_mm: float,
    length_m: float,
    rates: pd.DataFrame,
    mode: str = "median",
    vendor: str | None = None,
    pipe_class: str = DEFAULT_PIPE_CLASS,
) -> dict:
    """
    Calculate the full reconstruction cost breakdown for a single pipe.

    Returns a dict with keys:
        pipe_rate, pipe_cost,
        excavation_rate, excavation_cost,
        backfill_rate, backfill_cost,
        demolition_rate, demolition_cost,
        waste_rate, waste_cost,
        trench_volume_m3, waste_weight_t,
        total_cost, breakdown (list of line items)
    Returns None values for any item that could not be rated.
    """
    d_m = diameter_mm / 1000.0
    trench_width_m = d_m + 0.600          # pipe dia + 300mm each side
    trench_depth_m = 0.800 + d_m          # 800mm cover + pipe diameter
    trench_volume_m3 = trench_width_m * trench_depth_m * length_m
    # Subtract the void volume of the pipe itself (circular cross-section)
    pipe_void_m3 = (3.14159 * (d_m / 2) ** 2) * length_m
    soil_volume_m3 = trench_volume_m3 - pipe_void_m3
    waste_weight_t = soil_volume_m3 * SOIL_DENSITY_T_M3

    result = {
        "trench_volume_m3": round(trench_volume_m3, 2),
        "pipe_void_m3": round(pipe_void_m3, 2),
        "soil_volume_m3": round(soil_volume_m3, 2),
        "waste_weight_t": round(waste_weight_t, 2),
    }

    breakdown = []

    # 1. Pipe supply and install â€” always use SP7 median pipe rate table
    # (reconstruction contractor rates cover full civil works, not individual line items)
    pipe_rate = _get_pipe_rate(rates, diameter_mm, pipe_class)
    pipe_cost = (pipe_rate * length_m) if pipe_rate is not None else None
    result["pipe_rate"] = pipe_rate
    result["pipe_cost"] = pipe_cost
    breakdown.append({"item": f"Pipe ({pipe_class} Ã˜{int(diameter_mm)}mm)", "unit": "m",
                       "qty": round(length_m, 2), "rate": pipe_rate, "cost": pipe_cost})

    # 2. Excavation OTR
    exc_rate = _get_tiered_rate(rates, "Excavation (Other Than Rock-(OTR))", trench_volume_m3)
    exc_cost = (exc_rate * trench_volume_m3) if exc_rate is not None else None
    result["excavation_rate"] = exc_rate
    result["excavation_cost"] = exc_cost
    breakdown.append({"item": "Excavation OTR", "unit": "mÂ³",
                       "qty": round(trench_volume_m3, 2), "rate": exc_rate, "cost": exc_cost})

    # 3. Backfill with excavated material
    bkf_rate = _get_tiered_rate(rates, "Backfill with Excavated Material", trench_volume_m3)
    bkf_cost = (bkf_rate * trench_volume_m3) if bkf_rate is not None else None
    result["backfill_rate"] = bkf_rate
    result["backfill_cost"] = bkf_cost
    breakdown.append({"item": "Backfill with Excavated Material", "unit": "mÂ³",
                       "qty": round(trench_volume_m3, 2), "rate": bkf_rate, "cost": bkf_cost})

    # 4. Demolition of existing pipe
    dem_rate = _get_sp7_median_rate(rates, "Demolition")
    dem_cost = (dem_rate * trench_volume_m3) if dem_rate is not None else None
    result["demolition_rate"] = dem_rate
    result["demolition_cost"] = dem_cost
    breakdown.append({"item": "Demolition", "unit": "mÂ³",
                       "qty": round(trench_volume_m3, 2), "rate": dem_rate, "cost": dem_cost})

    # 5. Waste disposal
    waste_rate = _get_sp7_median_rate(rates, "Waste Disposal")
    waste_cost = (waste_rate * waste_weight_t) if waste_rate is not None else None
    result["waste_rate"] = waste_rate
    result["waste_cost"] = waste_cost
    breakdown.append({"item": "Waste Disposal", "unit": "t",
                       "qty": round(waste_weight_t, 2), "rate": waste_rate, "cost": waste_cost})

    # Total
    costs = [c["cost"] for c in breakdown if c["cost"] is not None]
    result["total_cost"] = sum(costs) if costs else None
    result["breakdown"] = breakdown

    return result

# ---------------------------------------------------------
# STREAM SPLITTING (USING SW_Condition)
# ---------------------------------------------------------

def split_streams(assets_df: pd.DataFrame):
    df = assets_df.copy()

    if CONDITION_COL not in df.columns and "Observed_Condition" not in df.columns:
        return df.iloc[0:0].copy(), df.iloc[0:0].copy(), df

    cond = _extract_condition_scores(df)

    rel_df = df[cond == 8].copy()
    rec_df = df[cond.isin([9, 10])].copy()

    # Amplification: conditions 4-7, flood hazard H3-H6 (SW LGA 20%), diameter >= 300mm
    FLOOD_COL = "SW LGA 20% H1-H6"
    AMP_CONDITIONS = [4, 5, 6, 7]
    AMP_HAZARDS = ["H3", "H4", "H5", "H6"]
    AMP_MIN_DIAM = 300.0

    amp_cond_mask = cond.isin(AMP_CONDITIONS)

    if FLOOD_COL in df.columns:
        flood = df[FLOOD_COL].astype(str).str.strip().str.upper()
        amp_flood_mask = flood.isin([h.upper() for h in AMP_HAZARDS])
    else:
        amp_flood_mask = pd.Series(False, index=df.index)

    if ASSET_DIAM_COL in df.columns:
        diam = pd.to_numeric(df[ASSET_DIAM_COL], errors="coerce")
        amp_diam_mask = diam >= AMP_MIN_DIAM
    else:
        amp_diam_mask = pd.Series(False, index=df.index)

    amp_df = df[amp_cond_mask & amp_flood_mask & amp_diam_mask].copy()

    return rel_df, rec_df, amp_df

# ---------------------------------------------------------
# COUNT-BASED PACKAGING (PRESERVES ASSET)
# ---------------------------------------------------------

def split_into_packages_by_count(df: pd.DataFrame,
                                 pipes_per_package: int,
                                 group_cols=None,
                                 prefix="PKG_"):

    if group_cols is None:
        group_cols = []

    df = df.copy()

    if ASSET_ID_COL in df.columns:
        df[ASSET_ID_COL] = df[ASSET_ID_COL].astype(str)

    if group_cols:
        df = df.sort_values(group_cols)

    package_ids = []
    pkg_idx = 0
    count_in_pkg = 0
    last_group_key = None

    for _, row in df.iterrows():
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

    df["package_id"] = [f"{prefix}{i+1:03d}" for i in package_ids]

    return df

# ---------------------------------------------------------
# VALUE-BASED PACKAGING (PRESERVES ASSET)
# ---------------------------------------------------------

def split_into_value_packages(df: pd.DataFrame,
                              max_package_value: float,
                              group_cols=None,
                              prefix="PKG_",
                              cost_col="pipe_cost"):

    if group_cols is None:
        group_cols = []

    if cost_col not in df.columns:
        raise ValueError(f"Missing cost column '{cost_col}' for value-based packaging.")

    # FIX: keep ALL columns instead of silently dropping anything not in the
    # required set â€” downstream code may depend on extra columns being present.
    df = df.copy()
    if ASSET_ID_COL in df.columns:
        df[ASSET_ID_COL] = df[ASSET_ID_COL].astype(str)

    grouped = df.groupby(group_cols, dropna=False) if group_cols else [(None, df)]

    all_packages = []
    pkg_counter = 1

    for _, group in grouped:
        group = group.sort_values(cost_col, ascending=False)

        current_pkg = []
        current_value = 0.0

        for _, row in group.iterrows():
            pipe_value = float(row[cost_col])

            if current_pkg and (current_value + pipe_value > max_package_value):
                for r in current_pkg:
                    r["package_id"] = f"{prefix}{pkg_counter:03d}"
                    all_packages.append(r)
                pkg_counter += 1
                current_pkg = []
                current_value = 0.0

            current_pkg.append(row.to_dict())
            current_value += pipe_value

        if current_pkg:
            for r in current_pkg:
                r["package_id"] = f"{prefix}{pkg_counter:03d}"
                all_packages.append(r)
            pkg_counter += 1

    return pd.DataFrame(all_packages)


# ---------------------------------------------------------
# SPATIAL CLUSTERING
# ---------------------------------------------------------

def assign_spatial_clusters(
    df: pd.DataFrame,
    radius_m: float,
    x_col: str = X_MID_COL,
    y_col: str = Y_MID_COL,
    suburb_col: str = SUBURB_COL,
) -> pd.DataFrame:
    """
    Anchor-based spatial clustering across the full dataset (no suburb boundary).

    Algorithm:
    1. Run DBSCAN globally to find natural groups of pipes within radius_m.
    2. For each cluster, find the most central pipe (closest to cluster centroid)
       as the anchor.
    3. All pipes within radius_m of the anchor form the package group.
    4. Pipes not claimed by any anchor (no coordinates) get their own individual
       cluster so they still get packaged.

    Adds a "_cluster" column (globally unique string label) to the dataframe.
    """
    import numpy as np

    TBA_VALUES = {"tba", "to be determined", "n/a", "not applicable", "", "nan", "none"}

    df = df.copy()
    df["_cluster"] = None
    cluster_counter = 0

    has_coords = (
        df[x_col].notna() & df[y_col].notna()
        if x_col in df.columns and y_col in df.columns
        else pd.Series(False, index=df.index)
    )

    # Identify TBA pipes â€” no usable suburb AND no coordinates
    # These are excluded from spatial clustering and grouped together
    if suburb_col in df.columns:
        suburb_is_tba = df[suburb_col].astype(str).str.strip().str.lower().isin(TBA_VALUES)
    else:
        suburb_is_tba = pd.Series(False, index=df.index)

    # Any pipe with a TBA suburb is excluded from spatial clustering entirely
    # regardless of whether it has coordinates
    is_tba = suburb_is_tba

    # Assign all TBA pipes to a single shared cluster
    df.loc[is_tba, "_cluster"] = "__TBA__"

    # Only cluster non-TBA pipes that have coordinates
    coords_df = df[has_coords & ~is_tba].copy()

    if not coords_df.empty:
        coords = coords_df[[x_col, y_col]].values
        all_indices = list(coords_df.index)
        assigned = set()

        # Pure anchor-radius approach â€” no DBSCAN chaining:
        # 1. Find the unassigned pipe closest to the centroid of all unassigned pipes
        # 2. Claim all unassigned pipes within radius_m of that anchor
        # 3. Repeat until all pipes are assigned

        while True:
            unassigned_mask = [i for i, idx in enumerate(all_indices) if idx not in assigned]
            if not unassigned_mask:
                break

            unassigned_coords = coords[unassigned_mask]
            unassigned_indices = [all_indices[i] for i in unassigned_mask]

            # Find centroid of remaining unassigned pipes
            centroid = unassigned_coords.mean(axis=0)

            # Pick the unassigned pipe closest to centroid as anchor
            dists_to_centroid = np.linalg.norm(unassigned_coords - centroid, axis=1)
            anchor_local = np.argmin(dists_to_centroid)
            anchor_coord = unassigned_coords[anchor_local]

            # Find ALL unassigned pipes within radius_m of this anchor
            dists_to_anchor = np.linalg.norm(unassigned_coords - anchor_coord, axis=1)
            in_radius = [unassigned_indices[i] for i, d in enumerate(dists_to_anchor) if d <= radius_m]

            for idx in in_radius:
                df.at[idx, "_cluster"] = f"cluster_{cluster_counter}"
                assigned.add(idx)

            cluster_counter += 1

    # Pipes with no coordinates get their own unique cluster
    # Pipes with no coordinates (and not already assigned as TBA) get their own unique cluster
    for idx in df[~has_coords & ~is_tba].index:
        df.at[idx, "_cluster"] = f"nocoord_{cluster_counter}"
        cluster_counter += 1

    return df


# ---------------------------------------------------------
# TWO-PASS VALUE PACKAGING WITH ADJACENT SIZE FILL
# ---------------------------------------------------------

def split_into_value_packages_twop(
    df: pd.DataFrame,
    max_package_value: float,
    suburb_col: str | None = None,
    prefix: str = "PKG_",
    cost_col: str = "pipe_cost",
    adjacent_fill: bool = True,
    custom_groups: list | None = None,
    group_col: str | None = None,
) -> pd.DataFrame:
    """
    group_col: column to use for grouping instead of suburb_col (e.g. "_cluster").
    custom_groups: list of lists of diameters e.g. [[375,450,525],[600,750]].
    Each inner list defines a group that can share packages together.
    Diameters not in any group use normal adjacent-size logic.
    """
    if group_col is not None:
        suburb_col = group_col
    """
    Two-pass packaging:

    Pass 1 â€” Group by suburb + exact diameter, fill packages to max_package_value.
              Any package that fills completely is locked in as a "full" package.
              Leftover pipes (packages under max value) are held back.

    Pass 2 â€” For each suburb, work through leftover pipes in diameter order
              (smallest first). Start filling a package with the smallest diameter.
              When remaining space exists, pull in pipes from the next diameter up,
              filling to just under max_package_value. Then package any remaining
              pipes of the next diameter, potentially filling with the size above
              that, and so on up the chain.

    Packages are numbered in suburb alphabetical order so mixed-size packages
    are interleaved naturally with full packages.
    """
    if cost_col not in df.columns:
        raise ValueError(f"Missing cost column '{cost_col}'")

    df = df.copy()
    if ASSET_ID_COL in df.columns:
        df[ASSET_ID_COL] = df[ASSET_ID_COL].astype(str)
    df["_diam_num"] = pd.to_numeric(df[ASSET_DIAM_COL], errors="coerce").fillna(0)

    suburb_groups = df.groupby(suburb_col, dropna=False) if suburb_col else [(None, df)]

    # Collect all packages as lists of row dicts, keyed by suburb for sorting
    suburb_packages = {}  # suburb -> list of (diam_order, [row_dicts])

    for suburb, suburb_df in suburb_groups:
        packages_for_suburb = []

        # Resolve groups for this suburb
        all_grouped_diams = set()
        resolved_groups = []
        for grp in (custom_groups or []):
            present = [d for d in sorted(suburb_df["_diam_num"].unique())
                       if int(d) in set(int(g) for g in grp) and int(d) not in all_grouped_diams]
            if present:
                resolved_groups.append(present)
                all_grouped_diams.update(int(d) for d in present)

        diameters_all = sorted(suburb_df["_diam_num"].unique())
        normal_diams = [d for d in diameters_all if int(d) not in all_grouped_diams]

        # Track which pipes are still unassigned
        unassigned = suburb_df.copy()

        def fill_from_pool(pool_df, current_pkg, current_value):
            """Greedily fill current_pkg from pool_df cheapest-first up to max_package_value."""
            pool_sorted = pool_df.sort_values(cost_col, ascending=True)
            used_indices = []
            for _, row in pool_sorted.iterrows():
                pipe_value = float(row[cost_col])
                if current_value + pipe_value <= max_package_value:
                    current_pkg.append(row.to_dict())
                    current_value += pipe_value
                    used_indices.append(row.name)
                else:
                    break
            return current_pkg, current_value, used_indices

        # â”€â”€ Pass 1: each custom group in order â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        for grp_diams in resolved_groups:
            grp_set = set(int(d) for d in grp_diams)
            grp_pipes = unassigned[unassigned["_diam_num"].apply(lambda d: int(d) in grp_set)]
            grp_pipes = grp_pipes.sort_values(cost_col, ascending=False)
            current_pkg = []
            current_value = 0.0
            for _, row in grp_pipes.iterrows():
                pipe_value = float(row[cost_col])
                if current_pkg and (current_value + pipe_value > max_package_value):
                    packages_for_suburb.append((min(grp_diams), current_pkg))
                    current_pkg = []
                    current_value = 0.0
                current_pkg.append(row.to_dict())
                current_value += pipe_value
                unassigned = unassigned.drop(row.name)
            if current_pkg:
                packages_for_suburb.append((min(grp_diams), current_pkg))

        # â”€â”€ Pass 2: normal diameters (adjacent-fill logic) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        diameters = normal_diams
        diam_idx = 0
        while diam_idx < len(diameters):
            diam = diameters[diam_idx]
            diam_pipes = unassigned[unassigned["_diam_num"] == diam].sort_values(cost_col, ascending=False)

            if diam_pipes.empty:
                diam_idx += 1
                continue

            current_pkg = []
            current_value = 0.0

            for _, row in diam_pipes.iterrows():
                pipe_value = float(row[cost_col])
                if current_pkg and (current_value + pipe_value > max_package_value):
                    packages_for_suburb.append((diam, current_pkg))
                    current_pkg = []
                    current_value = 0.0
                current_pkg.append(row.to_dict())
                current_value += pipe_value
                unassigned = unassigned.drop(row.name)

            if current_pkg:
                if adjacent_fill and diam_idx + 1 < len(diameters):
                    next_diam = diameters[diam_idx + 1]
                    if diameters_compatible(diam, next_diam):
                        next_pipes = unassigned[unassigned["_diam_num"] == next_diam].sort_values(cost_col, ascending=True)
                        current_pkg, current_value, used = fill_from_pool(next_pipes, current_pkg, current_value)
                        for idx in used:
                            unassigned = unassigned.drop(idx)
                packages_for_suburb.append((diam, current_pkg))

            diam_idx += 1

        suburb_packages[suburb] = packages_for_suburb

    # Number packages in suburb alphabetical order
    all_packages = []
    pkg_counter = 1

    for suburb in sorted(suburb_packages.keys(), key=lambda x: str(x)):
        for _, pkg_rows in suburb_packages[suburb]:
            for r in pkg_rows:
                r["package_id"] = f"{prefix}{pkg_counter:03d}"
                all_packages.append(r)
            pkg_counter += 1

    result = pd.DataFrame(all_packages)
    if "_diam_num" in result.columns:
        result = result.drop(columns=["_diam_num"])
    return result

# ---------------------------------------------------------
# PACKAGE SUMMARY
# ---------------------------------------------------------

def summarise_pipe_packages(df: pd.DataFrame) -> pd.DataFrame:
    if "package_id" not in df.columns:
        return pd.DataFrame()

    agg = {ASSET_ID_COL: "count"}
    if ASSET_LEN_COL in df.columns:
        agg[ASSET_LEN_COL] = "sum"
    if "pipe_cost" in df.columns:
        agg["pipe_cost"] = "sum"

    summary = df.groupby("package_id", dropna=False).agg(agg).reset_index()

    summary = summary.rename(columns={
        ASSET_ID_COL: "pipe_count",
        ASSET_LEN_COL: "total_length_m",
        "pipe_cost": "total_cost",
    })

    return summary

# ---------------------------------------------------------
# DIAMETER SIZE GROUPS FOR TOP-UP LOGIC
# ---------------------------------------------------------

# Each entry is a pair of diameters that share a rate table row and can be
# packaged together. A diameter can appear in multiple pairs â€” e.g. 450 can
# go with 375 or 525.
DIAMETER_COMPATIBLE_PAIRS = [
    (300, 375),
    (375, 450),
    (450, 525),
    (525, 600),
    (600, 750),
    (750, 825),
    (825, 900),
    (900, 1050),
]
DIAMETER_LARGE_THRESHOLD = 1050


def diameters_compatible(d1: float, d2: float) -> bool:
    """Returns True if two diameters share a rate table row and can be packaged together."""
    if d1 == d2:
        return True
    if d1 >= DIAMETER_LARGE_THRESHOLD and d2 >= DIAMETER_LARGE_THRESHOLD:
        return True
    return (min(d1, d2), max(d1, d2)) in {(min(a, b), max(a, b)) for a, b in DIAMETER_COMPATIBLE_PAIRS}


def get_package_group_label(diameter: float) -> str:
    """
    Returns a stable group label for use as a packaging group_col.
    Pipes with compatible diameters get the same label by always using
    the smaller diameter in the compatible pair as the label.
    e.g. 375mm and 450mm both return "375_450", 450mm and 525mm return "450_525"
    but since 450 appears in both pairs we assign it to its LOWER pair so that
    a 375 and 450 will share a label, and a 525 will also share with 450 if needed.

    Strategy: assign each diameter to the pair where it is the LARGER member,
    so it groups upward with the next size. Exception: the smallest size (300)
    groups with 375.
    """
    if diameter >= DIAMETER_LARGE_THRESHOLD:
        return "1050plus"
    for smaller, larger in DIAMETER_COMPATIBLE_PAIRS:
        if diameter == larger:
            return f"{smaller}_{larger}"
    # diameter is the smallest in its pair (i.e. 300) â€” use first pair
    for smaller, larger in DIAMETER_COMPATIBLE_PAIRS:
        if diameter == smaller:
            return f"{smaller}_{larger}"
    return str(int(diameter))


def get_size_group(diameter: float) -> frozenset:
    """Returns a frozenset representing the compatible group for topup matching."""
    if diameter >= DIAMETER_LARGE_THRESHOLD:
        return frozenset({1050})
    for smaller, larger in DIAMETER_COMPATIBLE_PAIRS:
        if diameter in (smaller, larger):
            return frozenset({smaller, larger})
    return frozenset({diameter})


def topup_packages(
    packaged: pd.DataFrame,
    topup_pool: pd.DataFrame,
    max_package_value: float,
    suburb_col: str | None = None,
) -> pd.DataFrame:
    """
    Top up underfilled packages using pipes from topup_pool.

    For each package under max_package_value, looks in the same suburb
    and same diameter size group for unallocated pipes from topup_pool,
    adding them greedily until the package is full or no more pipes fit.

    Parameters
    ----------
    packaged        : existing packaged df with package_id and pipe_cost
    topup_pool      : candidate pipes (lower priority) with rate_per_m and pipe_cost
    max_package_value : the max value threshold used when packaging
    suburb_col      : suburb column name, or None

    Returns
    -------
    Combined dataframe with original packages plus any top-up pipes appended,
    top-up pipes tagged with their package_id and a 'topup' flag column.
    """
    if topup_pool.empty or packaged.empty:
        return packaged

    # Track which pool pipes have been used
    used_ids = set()
    topup_rows = []

    # Process each package
    for pkg_id, pkg_group in packaged.groupby("package_id"):
        pkg_total = pkg_group["pipe_cost"].sum()
        remaining = max_package_value - pkg_total

        if remaining <= 0:
            continue

        # Determine suburb(s) and size group(s) for this package
        pkg_suburbs = set(pkg_group[suburb_col].astype(str).unique()) if suburb_col and suburb_col in pkg_group.columns else None
        pkg_diams = pd.to_numeric(pkg_group[ASSET_DIAM_COL], errors="coerce").dropna().unique()
        pkg_size_groups = {get_size_group(d) for d in pkg_diams}

        # Filter pool to same suburb and compatible size group
        pool = topup_pool[~topup_pool[ASSET_ID_COL].isin(used_ids)].copy()

        if suburb_col and pkg_suburbs and suburb_col in pool.columns:
            pool = pool[pool[suburb_col].astype(str).isin(pkg_suburbs)]

        if ASSET_DIAM_COL in pool.columns:
            pool = pool[
                pool[ASSET_DIAM_COL].apply(
                    lambda d: get_size_group(float(d)) in pkg_size_groups
                    if pd.notna(d) else False
                )
            ]

        if pool.empty:
            continue

        # Sort by cost ascending so we can fit as many pipes as possible
        pool = pool.sort_values("pipe_cost", ascending=True)

        for _, pipe in pool.iterrows():
            pipe_cost = pipe["pipe_cost"]
            if pipe_cost <= remaining:
                row = pipe.to_dict()
                row["package_id"] = pkg_id
                row["topup"] = True
                topup_rows.append(row)
                used_ids.add(pipe[ASSET_ID_COL])
                remaining -= pipe_cost

    if not topup_rows:
        return packaged

    topup_df = pd.DataFrame(topup_rows)
    packaged = packaged.copy()
    packaged["topup"] = False
    result = pd.concat([packaged, topup_df], ignore_index=True)
    return result
# ---------------------------------------------------------
# PACKAGE PRIORITY ENGINE
# ---------------------------------------------------------

CRITICALITY_COL = "SW_Criticality"  # <-- change if needed


def _diameter_weight(d):
    if pd.isna(d):
        return 1.0
    d = float(d)
    if d < 225:
        return 1.0
    elif d < 300:
        return 1.2
    elif d < 375:
        return 1.5
    elif d < 525:
        return 1.8
    else:
        return 2.2


def _condition_score(c):
    if pd.isna(c):
        return 1.0
    return float(c)


def _criticality_weight(c):
    if pd.isna(c):
        return 1.0
    return 1 + round(float(c), 1)   # <-- YOUR 1 decimal requirement


def add_package_priority(df: pd.DataFrame) -> pd.DataFrame:
    """
    Adds:
        pipe_priority_score
        package_priority_score
        package_priority_rank
    """

    if "package_id" not in df.columns:
        return df

    df = df.copy()

    # Ensure columns exist
    if CRITICALITY_COL not in df.columns:
        df[CRITICALITY_COL] = 0

    # -----------------------------------------------------
    # PIPE SCORE
    # -----------------------------------------------------
    df["_diam_w"] = df[ASSET_DIAM_COL].apply(_diameter_weight)
    df["_cond_s"] = df[CONDITION_COL].apply(_condition_score)
    df["_crit_w"] = df[CRITICALITY_COL].apply(_criticality_weight)

    df["pipe_priority_score"] = (
        df["_cond_s"] * df["_diam_w"] * df["_crit_w"]
    )

    # -----------------------------------------------------
    # PACKAGE AGGREGATION
    # -----------------------------------------------------
    grouped = df.groupby("package_id").agg(
        total_score=("pipe_priority_score", "sum"),
        high_crit_count=(CRITICALITY_COL, lambda x: (x >= 4.0).sum()),
        large_diam_count=(ASSET_DIAM_COL, lambda x: (x >= 375).sum()),
        worst_condition=(CONDITION_COL, "max"),
        pipe_count=(ASSET_ID_COL, "count")
    ).reset_index()

    # -----------------------------------------------------
    # BONUS WEIGHTS (tune later if needed)
    # -----------------------------------------------------
    grouped["package_priority_score"] = (
        grouped["total_score"]
        + grouped["high_crit_count"] * 5
        + grouped["large_diam_count"] * 3
        + grouped["worst_condition"] * 2
    )

    # -----------------------------------------------------
    # RANKING (HIGH → LOW)
    # -----------------------------------------------------
    grouped = grouped.sort_values(
        by=["package_priority_score", "total_score"],
        ascending=False
    )

    grouped["package_priority_rank"] = range(1, len(grouped) + 1)

    # -----------------------------------------------------
    # MERGE BACK
    # -----------------------------------------------------
    df = df.merge(
        grouped[[
            "package_id",
            "package_priority_score",
            "package_priority_rank"
        ]],
        on="package_id",
        how="left"
    )

    return df
