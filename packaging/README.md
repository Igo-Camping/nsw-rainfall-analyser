# NBC Stormwater Packaging Tool

Streamlit + FastAPI tool for grouping stormwater pipe assets into costed relining/reconstruction packages for capital works planning.

## Source of truth

`packaging/` (this directory) is the **canonical, version-controlled tool**. All active development happens here.

`D:\Packaging` is a **legacy reference only** — kept on disk for historical comparison. Do not edit there. Do not treat it as authoritative.

## Layout

| Path | Purpose |
|---|---|
| `scripts/cost_engine.py` | Core packaging library — rate lookup, reconstruction costing, packaging algorithms |
| `scripts/ui.py` | Streamlit front-end |
| `scripts/api.py` | FastAPI/uvicorn HTTP API for ESRI Experience Builder |
| `scripts/populate_forward_works.py` | Generates `pipe_renewal_backlog.xlsx` from a relining packages zip |
| `scripts/merge_coordinates.py` | Merges GIS coordinates into assets and reverse-geocodes addresses |
| `scripts/restore_addresses.py` | Restores addresses from previously exported package CSVs |
| `scripts/fetch_lga_boundaries.py` | Fetches NSW LGA boundary data |
| `scripts/deployment_config.py`, `scripts/packaging_config.json` | API deployment config |
| `scripts/build.bat`, `scripts/.streamlit/`, `scripts/web/` | PyInstaller build, Streamlit config, ESRI handoff web bundle |
| `data/` | Panel rates and asset/coordinate inputs/outputs (gitignored — see below) |
| `handoff_experience_builder/` | ESRI Experience Builder handoff source |
| `run_ui.bat`, `run_api.bat`, `run_esri_web.bat` | Local launchers |
| `CLAUDE.md` | Tool-specific Claude Code project instructions |

## Running

```bat
:: Streamlit UI
run_ui.bat

:: HTTP API (FastAPI/uvicorn)
run_api.bat

:: ESRI Experience Builder bridge (Streamlit headless for web embedding)
run_esri_web.bat
```

The launchers activate the venv at `D:\LLM\llm-env` and run the scripts under `packaging\scripts\`. Venv location is independent of the tool.

To run directly with the venv active:

```bat
cd packaging\scripts
streamlit run ui.py
```

## Data

The tool expects input/output files under `packaging\data\`:

| File | Purpose |
|---|---|
| `assets.csv` / `assets_with_coords.csv` | Pipe asset inventory |
| `coordinates.csv` | GIS coordinate export |
| `Panel_Rates.xlsx` | Contractor panel rates (`_Tables` sheet) |
| `extracted_addresses.csv` | Address backup for `restore_addresses.py` |
| `relining_packages.zip` | Output from UI — input to `populate_forward_works.py` |
| `pipe_renewal_backlog.xlsx` | Output of `populate_forward_works.py` |
| `forward_works*.xlsx` | Forward works exports |

**Data files are gitignored.** Repo-level `.gitignore` excludes `*.csv`, `*.xlsx`, `*.xlsm` globally. Additional packaging-specific ignores cover build/runtime artefacts: `packaging/scripts/__pycache__/`, `packaging/scripts/build/`, `packaging/scripts/dist/`, `packaging/scripts/web/streamlit_url.txt`, `packaging/scripts/.streamlit/secrets.toml`, `packaging/data/forward_works*.xlsx`, `packaging/data/pipe_renewal_backlog.xlsx`, `packaging/data/relining_packages.zip`, `packaging/handoff_experience_builder.zip`.

To bootstrap a fresh machine, drop your input data files into `packaging\data\`. The scripts resolve paths relative to themselves (`Path(__file__).resolve().parents[1] / "data"`), so no absolute paths need configuring.

## Legacy files at repo root

Three older sibling files exist at the repo root, all gitignored:

- `costing_engine.py`
- `costing_api.py`
- `costing_lookup.json`

These are an earlier, thinner fork. The canonical engine is `packaging/scripts/cost_engine.py`. Reconcile or remove the legacy root files in a separate change.
