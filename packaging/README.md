# NBC Stormwater Packaging Tool

Consolidated copy of the NBC packaging tool brought into the main repo on 2026-05-04 from `D:\Packaging`. Tracks the active codebase under version control alongside the rest of the Pluvio/Stormgauge project.

## Source of truth

`D:\Packaging` remains the canonical working tree. Active development continues there. This `packaging/` subtree is the version-controlled mirror of the live tool — copy-only consolidation, source not modified.

## What's in here

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
| `data/` | Panel rates and asset/coordinate CSVs (most files git-ignored — see below) |
| `handoff_experience_builder/` | ESRI Experience Builder handoff source |
| `ESRI_HANDOFF_README.{md,txt}`, `ESRI_WEB_DEPLOYMENT.{md,txt}` | ESRI deployment docs |
| `Panel_Rates_2022.xlsx` | Historical rates reference |
| `requirements-esri.txt`, `install_requirements_esri.bat` | ESRI deployment dependencies |
| `run_ui.bat`, `run_api.bat`, `start_packaging_api.bat`, `run_esri_web.bat` | Local launchers |
| `CLAUDE.md` | Tool-specific Claude Code project instructions |

## Running the tool

Launchers in this folder were repointed to read from `packaging\scripts\`. The Python venv reference (`D:\LLM\llm-env`) is unchanged because the venv lives independently of the tool.

```bat
:: Streamlit UI
run_ui.bat

:: HTTP API (FastAPI/uvicorn)
run_api.bat

:: ESRI Experience Builder bridge
start_packaging_api.bat
run_esri_web.bat
```

To run directly with the venv active:

```bash
cd packaging\scripts
streamlit run ui.py
```

To build the standalone exe:

```bat
cd packaging\scripts
build.bat
```

## What was excluded from the consolidation

These were left in `D:\Packaging` and not copied:

| Excluded | Reason |
|---|---|
| `Superseeded\` | Hard rule — no shadow/backup folders in the repo |
| `scripts\*.bak`, `scripts\PREVIOUS*.py` | Pre-edit snapshots — git history is the backup |
| `scripts\build\`, `scripts\dist\` | PyInstaller build artefacts |
| `scripts\__pycache__\` | Python bytecode cache |
| `data\assets_with_coords OLD.csv`, `data\assets_with_coords pre_merge_backup.csv` | Pre-merge backups |
| `data\forward_works.xlsx`, `data\forward_works_updated.xlsx`, `data\pipe_renewal_backlog.xlsx`, `data\relining_packages.zip` | Generated outputs |

## Git-ignored inside `packaging/`

Repo-level `.gitignore` already excludes `*.csv`, `*.xlsx`, `*.xlsm` globally. That means `data/Panel_Rates.xlsx`, `data/assets_with_coords.csv`, etc. are present on disk so the tool runs, but not version-controlled. To rebuild a fresh machine, copy `data\` from `D:\Packaging\data\`.

Additional `packaging/`-specific ignores (see root `.gitignore`):
`packaging/scripts/__pycache__/`, `packaging/scripts/build/`, `packaging/scripts/dist/`, `packaging/scripts/web/streamlit_url.txt`, `packaging/scripts/.streamlit/secrets.toml`, `packaging/data/forward_works*.xlsx`, `packaging/data/pipe_renewal_backlog.xlsx`, `packaging/data/relining_packages.zip`, `packaging/handoff_experience_builder.zip`.

## Hard-coded `D:\Packaging\data\` paths

The following copied scripts still reference `D:\Packaging\data\` directly:

- `scripts/merge_coordinates.py`
- `scripts/populate_forward_works.py`
- `scripts/restore_addresses.py`

Left as-is per the consolidation scope (launcher `.bat` paths only). They continue to function because `D:\Packaging\data\` remains canonical. If `D:\Packaging` is ever decommissioned, repoint these constants to `packaging\data\`.

## Legacy files at repo root

Three older sibling files exist at the repo root and **were not touched** by this consolidation:

- `costing_engine.py` (2026-04-16, 7.3 KB)
- `costing_api.py` (2026-04-16, 2.4 KB)
- `costing_lookup.json` (2026-04-16, 1 MB)

These are an earlier, thinner fork of the packaging engine kept at the root. The canonical engine is `packaging/scripts/cost_engine.py` (43.7 KB, 2026-04-30). Reconcile or remove the legacy root files in a separate change.
