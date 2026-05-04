# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this tool does

**Stormwater Packaging Tool** — a Streamlit web app for grouping stormwater pipe assets into costed relining/reconstruction packages for capital works planning.

Workflow:
1. Assets loaded from `data/assets_with_coords.csv` (pipe inventory with GIS coordinates)
2. Pipes filtered by condition and split into **relining** (SP6) or **reconstruction** (SP7) streams
3. Packages formed by suburb, size group, spatial proximity, or pipe count
4. Costs calculated from `data/Panel_Rates.xlsx` (contractor panel rates, sheet `_Tables`)
5. Packages downloaded as a ZIP of CSVs, then fed into `populate_forward_works.py`

## Running the app

```bat
# Double-click, or from terminal:
D:\Packaging\run_ui.bat
```

This activates the venv at `D:\LLM\llm-env` and runs `streamlit run scripts/ui.py`.

To run directly (if venv already active):
```bash
cd D:\Packaging\scripts
streamlit run ui.py
```

## Building the standalone exe

```bat
cd D:\Packaging\scripts
build.bat
```

Uses PyInstaller with `packaging_tool.spec`. Output is in `scripts/dist/StormwaterPackagingTool/` — distribute the whole folder, not just the `.exe`.

## Data preparation scripts

Run these from `D:\Packaging\scripts\` with the venv active:

```bash
# Merge GIS coordinate export into assets CSV (also reverse-geocodes addresses via Google Maps API)
py merge_coordinates.py

# Restore addresses from previously exported package CSVs (avoids re-geocoding)
py restore_addresses.py

# Generate forward works Excel from a relining_packages.zip
py populate_forward_works.py
```

## Architecture

### `scripts/cost_engine.py`
Core library — no Streamlit dependency. Key responsibilities:
- **Rate loading**: reads `Panel_Rates.xlsx` `_Tables` sheet; filters SP6 (relining) and SP7 (reconstruction) rows
- **Rate lookup** (`lookup_sp6_rate`): matches pipe diameter + length band; supports `median`, `lowest`, and `vendor` modes
- **Reconstruction costing** (`calc_reconstruction_cost`): full breakdown — pipe supply, excavation, backfill, demolition, waste disposal — all tiered by volume/diameter
- **Packaging algorithms**: `split_into_value_packages`, `split_into_value_packages_twop`, `split_into_packages_by_count`, `assign_spatial_clusters`, `topup_packages`
- **Stream splitting** (`split_streams`): separates assets into relining vs reconstruction candidates

### `scripts/ui.py`
Streamlit front-end. Imports everything from `cost_engine`. Handles:
- File path resolution for both dev (`../data/`) and frozen exe (`sys._MEIPASS/data/`) modes
- UI tabs: asset loading → filtering → packaging → cost review → download
- ZIP generation of per-package CSVs via `create_zip_from_packages`

### `scripts/populate_forward_works.py`
Standalone script — reads `relining_packages.zip`, assigns packages to financial years (2027–2032) using an escalating budget schedule starting at $3M/year, and writes `pipe_renewal_backlog.xlsx` formatted for the 15) Pipe Renewal Backlog tab.

### `scripts/merge_coordinates.py`
Standalone — merges `coordinates.csv` into `assets.csv` on the `Asset` ID column, converts MGA Zone 56 coordinates to WGS84 lat/lon, and reverse-geocodes pipe start addresses via Google Maps API (incremental — resumes from last saved point).

## Key column names (defined as constants in `cost_engine.py`)

| Constant | Column |
|---|---|
| `ASSET_ID_COL` | `Asset` |
| `ASSET_DIAM_COL` | `SWP_Pipe Diameter_mm` |
| `ASSET_LEN_COL` | `Spatial Length_m` |
| `CONDITION_COL` | `SW_Condition` |
| `X_MID_COL` / `Y_MID_COL` | `XMid` / `YMid` |

## Data files

| File | Purpose |
|---|---|
| `data/assets_with_coords.csv` | Primary asset source (preferred over `assets.csv`) |
| `data/assets.csv` | Asset inventory without coordinates |
| `data/coordinates.csv` | GIS coordinate export |
| `data/Panel_Rates.xlsx` | Contractor panel rates (`_Tables` sheet) |
| `data/relining_packages.zip` | Output from UI — input to `populate_forward_works.py` |
| `data/pipe_renewal_backlog.xlsx` | Output of `populate_forward_works.py` |
| `data/extracted_addresses.csv` | Address backup for `restore_addresses.py` |

## PyInstaller / frozen exe notes

Both `ui.py` and `cost_engine.py` check `getattr(sys, "frozen", False)` to locate `data/` under `sys._MEIPASS` when running as an exe. The spec file is `scripts/packaging_tool.spec`.
