"""
merge_coordinates.py

Merges ONLY coordinate columns from an Intramaps/GIS export into the main
assets CSV, then reverse geocodes a street address from XStart/YStart.

Usage:
    py merge_coordinates.py
"""

import pandas as pd
import os
from pathlib import Path

# ---------------------------------------------------------
# CONFIGURE PATHS
# ---------------------------------------------------------

PACKAGING_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PACKAGING_ROOT / "data"

ASSETS_FILE  = str(DATA_DIR / "assets.csv")
COORDS_FILE  = str(DATA_DIR / "coordinates.csv")
OUTPUT_FILE  = str(DATA_DIR / "assets_with_coords.csv")

ASSETS_ID_COL = "Asset"
COORDS_ID_COL = "Asset"

COORD_COLS = ["XStart", "YStart", "XEnd", "YEnd", "XMid", "YMid"]

MGA_ZONE = 56

# ---------------------------------------------------------
# MERGE COORDINATES
# ---------------------------------------------------------

print(f"Loading assets from:      {ASSETS_FILE}")
print(f"Loading coordinates from: {COORDS_FILE}")

assets = pd.read_csv(ASSETS_FILE, dtype={ASSETS_ID_COL: str}, low_memory=False)
coords = pd.read_csv(COORDS_FILE, dtype={COORDS_ID_COL: str}, low_memory=False)

assets[ASSETS_ID_COL] = assets[ASSETS_ID_COL].astype(str).str.strip().str.replace(r"\.0$", "", regex=True)
coords[COORDS_ID_COL] = coords[COORDS_ID_COL].astype(str).str.strip().str.replace(r"\.0$", "", regex=True)

# Pull only coordinate columns
cols_to_keep = [COORDS_ID_COL] + [c for c in COORD_COLS if c in coords.columns]
missing = [c for c in COORD_COLS if c not in coords.columns]
if missing:
    print(f"  Warning: coordinate columns not found: {missing}")

coords_slim = coords[cols_to_keep].rename(columns={COORDS_ID_COL: ASSETS_ID_COL})

# Convert XMid/YMid to Latitude/Longitude
try:
    from pyproj import Transformer
    transformer = Transformer.from_crs(f"EPSG:{28300 + MGA_ZONE}", "EPSG:4326", always_xy=True)
    lons, lats = transformer.transform(coords_slim["XMid"].values, coords_slim["YMid"].values)
    coords_slim["Longitude"] = lons
    coords_slim["Latitude"] = lats
    print("  Converted XMid/YMid to Latitude/Longitude")
except Exception as e:
    print(f"  Lat/lon conversion failed: {e}")

# Drop existing coord columns from assets to avoid duplicates
for col in [c for c in coords_slim.columns if c != ASSETS_ID_COL]:
    if col in assets.columns:
        assets = assets.drop(columns=[col])

merged = assets.merge(coords_slim, on=ASSETS_ID_COL, how="left")

matched   = merged["XMid"].notna().sum() if "XMid" in merged.columns else 0
unmatched = merged["XMid"].isna().sum()  if "XMid" in merged.columns else len(merged)

print(f"\nCoordinate merge results:")
print(f"  Total assets:        {len(merged):,}")
print(f"  Matched with coords: {matched:,}")
print(f"  No coords found:     {unmatched:,}")

# ---------------------------------------------------------
# REVERSE GEOCODE STREET ADDRESS FROM XStart/YStart
# ---------------------------------------------------------

print(f"\nReverse geocoding street addresses from XStart/YStart...")

try:
    from pyproj import Transformer
    from geopy.geocoders import Nominatim
    from geopy.extra.rate_limiter import RateLimiter

    transformer = Transformer.from_crs(f"EPSG:{28300 + MGA_ZONE}", "EPSG:4326", always_xy=True)

    # Build a lookup df of pipes with valid XStart/YStart
    has_start = (
        merged["XStart"].notna() &
        merged["YStart"].notna() &
        (pd.to_numeric(merged["XStart"], errors="coerce") != 0) &
        (pd.to_numeric(merged["YStart"], errors="coerce") != 0)
    )

    to_geocode = merged[has_start][["XStart", "YStart"]].copy()
    to_geocode["XStart"] = pd.to_numeric(to_geocode["XStart"], errors="coerce")
    to_geocode["YStart"] = pd.to_numeric(to_geocode["YStart"], errors="coerce")

    print(f"  {len(to_geocode):,} pipes with valid start coordinates to geocode")

    if to_geocode.empty:
        print("  No pipes to geocode — check XStart/YStart values in coordinates.csv")
    else:
        lons, lats = transformer.transform(to_geocode["XStart"].values, to_geocode["YStart"].values)
        to_geocode["_lat"] = lats
        to_geocode["_lon"] = lons

        import requests
        import time

        GOOGLE_API_KEY = "AIzaSyAkUJOgHb8NnZYGPr-yic4r9GOM_iD-pes"
        GOOGLE_URL = "https://maps.googleapis.com/maps/api/geocode/json"

        # Load any existing addresses from a previous run to avoid re-geocoding
        if "Pipe_Start_Address" not in merged.columns:
            merged["Pipe_Start_Address"] = None

        if os.path.isfile(OUTPUT_FILE):
            try:
                existing_df = pd.read_csv(OUTPUT_FILE, dtype={"Asset": str}, low_memory=False)
                if "Pipe_Start_Address" in existing_df.columns and "Asset" in existing_df.columns:
                    existing_df = existing_df[existing_df["Pipe_Start_Address"].notna()]
                    existing_df["Asset"] = existing_df["Asset"].str.strip().str.replace(r"\.0$", "", regex=True)
                    merged["Asset"] = merged["Asset"].astype(str).str.strip().str.replace(r"\.0$", "", regex=True)
                    addr_map = existing_df.set_index("Asset")["Pipe_Start_Address"].to_dict()
                    merged["Pipe_Start_Address"] = merged["Asset"].map(addr_map)
                    print(f"  Loaded {len(addr_map):,} existing addresses from previous run")
            except Exception as e:
                print(f"  Could not load existing addresses: {e}")

        # Only geocode pipes that still have no address
        already_done = set(merged[merged["Pipe_Start_Address"].notna()].index)
        needs_geocode = to_geocode[~to_geocode.index.isin(already_done)]

        total = len(needs_geocode)
        skipped = len(to_geocode) - total
        print(f"  {skipped:,} pipes already have addresses — skipping")
        print(f"  {total:,} pipes to geocode now")

        SAVE_EVERY = 50  # Save every 50 pipes — balance between safety and speed

        for i, (idx, row) in enumerate(needs_geocode.iterrows()):
            try:
                # Single call — no result_type filter, get all results back
                resp = requests.get(GOOGLE_URL, params={
                    "latlng": f"{row['_lat']},{row['_lon']}",
                    "key": GOOGLE_API_KEY,
                }, timeout=10)
                data = resp.json()

                address = None
                suburb = None

                if data.get("status") == "OK" and data.get("results"):
                    results = data["results"]

                    # Priority 1: find a result with both street number and route
                    for result in results:
                        components = result.get("address_components", [])
                        number = next((c["short_name"] for c in components if "street_number" in c["types"]), "")
                        route = next((c["short_name"] for c in components if "route" in c["types"]), "")
                        if not suburb:
                            suburb = next((c["short_name"] for c in components
                                          if any(t in c["types"] for t in ["locality", "sublocality", "suburb"])), None)
                        if number and route:
                            address = f"{number} {route}"
                            break

                    # Priority 2: route only (no house number)
                    if not address:
                        for result in results:
                            components = result.get("address_components", [])
                            route = next((c["short_name"] for c in components if "route" in c["types"]), "")
                            if not suburb:
                                suburb = next((c["short_name"] for c in components
                                              if any(t in c["types"] for t in ["locality", "sublocality", "suburb"])), None)
                            if route:
                                address = route
                                break

                    # Priority 3: use first formatted address as-is
                    if not address:
                        address = results[0]["formatted_address"].split(",")[0]
                        if not suburb:
                            components = results[0].get("address_components", [])
                            suburb = next((c["short_name"] for c in components
                                          if any(t in c["types"] for t in ["locality", "sublocality", "suburb"])), None)

                if address:
                    if suburb:
                        address = f"{address}, {suburb}"
                    merged.at[idx, "Pipe_Start_Address"] = address
                else:
                    merged.at[idx, "Pipe_Start_Address"] = None
            except Exception as e:
                merged.at[idx, "Pipe_Start_Address"] = None

            if (i + 1) % 10 == 0 or (i + 1) == total:
                print(f"  {i + 1:,}/{total:,} geocoded...")

            # Save incrementally every SAVE_EVERY pipes
            if (i + 1) % SAVE_EVERY == 0:
                merged.to_csv(OUTPUT_FILE, index=False)
                print(f"  Progress saved ({i + 1:,} done)")

        resolved = merged["Pipe_Start_Address"].notna().sum()
        print(f"  Address resolved for {resolved:,} of {len(to_geocode):,} pipes")

except ImportError as e:
    print(f"  Missing library: {e}")
    print("  Run: py -m pip install geopy pyproj")
except Exception as e:
    print(f"  Geocoding failed: {e}")

# ---------------------------------------------------------
# SAVE
# ---------------------------------------------------------

merged.to_csv(OUTPUT_FILE, index=False)
print(f"\nSaved to: {OUTPUT_FILE}")