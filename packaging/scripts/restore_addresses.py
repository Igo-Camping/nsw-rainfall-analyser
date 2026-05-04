"""
restore_addresses.py

Restores Pipe_Start_Address data extracted from previously downloaded
package CSVs into assets_with_coords.csv, without overwriting any
existing addresses.

Usage:
    py restore_addresses.py

Run from packaging/scripts/.
Place extracted_addresses.csv in packaging/data/.
"""

import pandas as pd
import os
from pathlib import Path

PACKAGING_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PACKAGING_ROOT / "data"

ASSETS_FILE   = str(DATA_DIR / "assets_with_coords.csv")
ADDR_FILE     = str(DATA_DIR / "extracted_addresses.csv")
OUTPUT_FILE   = str(DATA_DIR / "assets_with_coords.csv")

print(f"Loading assets from: {ASSETS_FILE}")
print(f"Loading addresses from: {ADDR_FILE}")

assets = pd.read_csv(ASSETS_FILE, dtype={"Asset": str}, low_memory=False)
addrs  = pd.read_csv(ADDR_FILE,   dtype={"Asset": str})

# Normalise IDs
assets["Asset"] = assets["Asset"].astype(str).str.strip().str.replace(r"\.0$", "", regex=True)
addrs["Asset"]  = addrs["Asset"].astype(str).str.strip().str.replace(r"\.0$", "", regex=True)

# Ensure Pipe_Start_Address column exists
if "Pipe_Start_Address" not in assets.columns:
    assets["Pipe_Start_Address"] = None

# Build address lookup
addr_map = addrs.set_index("Asset")["Pipe_Start_Address"].to_dict()

# Only fill in where address is currently missing
missing_mask = assets["Pipe_Start_Address"].isna() | (assets["Pipe_Start_Address"].astype(str).str.strip() == "")
assets.loc[missing_mask, "Pipe_Start_Address"] = assets.loc[missing_mask, "Asset"].map(addr_map)

restored = assets["Pipe_Start_Address"].notna().sum()
print(f"\nResults:")
print(f"  Total assets:           {len(assets):,}")
print(f"  Assets with addresses:  {restored:,}")

assets.to_csv(OUTPUT_FILE, index=False)
print(f"\nSaved to: {OUTPUT_FILE}")
