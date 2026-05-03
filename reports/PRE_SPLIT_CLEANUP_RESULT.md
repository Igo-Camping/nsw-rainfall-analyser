# Pre-split cleanup — result report

## 1. Executive summary
Applied the approved cleanup from `reports/PRE_SPLIT_CLEANUP_MANIFEST.md`: removed 10 tracked duplicate artefacts (8 superseded data/asset blobs and 2 root `index_backup*.html` files) and added 6 ignore rules covering local/generated working files. No source, logic, asset, routing, splash, AEP, IFD, station, export, radar, BOM, or RainViewer files were touched. The `Assets/Logos` vs `assets/logos` case-clash and the `switchPage` / `escapeHtml` duplicate-definition findings remain deliberately deferred to dedicated commits.

## 2. Branch and HEAD commit
- Branch: `staging`
- HEAD before cleanup: `0f0ffec70fb59ad2dc2a863981463f67ebe6670f` ("Move Pluviometrics email signature logo to lowercase asset path")

## 3. Approved files removed (10)
| Path | Lines removed |
|---|---:|
| `Superseeded/bom_ifd_cache.js` | 1 |
| `Superseeded/bom_northern_beaches_all_gauges.js` | 1 |
| `Superseeded/nsw_lga_boundaries.js` | 1 |
| `Superseeded/pluviometrics_ifd_cache.json` | 277,602 |
| `Superseeded/pluviometrics_ifd_errors.json` | 8 |
| `Superseeded/pluviometrics_ifd_table.json` | 290,169 |
| `Superseeded/pluviometrics_rainfall_stations.json` | 18,519 |
| `Superseeded/pluviometrics_stations.json` | 137 |
| `index_backup.html` | 4,938 |
| `index_backup_1.html` | 5,154 |
| **Total** | **596,530** |

All removals are deletions of **tracked** entries from the index; the underlying disk files are gone via `git rm`. Live equivalents in `data/`, root JS blobs, and `index.html` remain in place and untouched.

## 4. `.gitignore` rules added (6, none pre-existing)
Appended a new commented section at the end of `.gitignore`:

```
# Local/generated Stormgauge working files
.claude/
.tmp_*
_staging_rebuild/
data/_backup/
data/radar_archive/
Superseeded/snapshot-*/
```

Effect on `git status --short`: 6 entries that were previously listed as untracked (`.claude/`, `.tmp_zipbundle.txt`, `.tmp_zipfunc.txt`, `_staging_rebuild/`, `data/_backup/`, `data/radar_archive/`, `Superseeded/snapshot-20260430-082224/`) are now silenced.

No existing `.gitignore` rules were reordered or rewritten.

## 5. Files deliberately left untouched
- `Assets/Logos/ATMOS.png`, `Assets/Logos/PLUVIOMETRICS.png`, `Assets/Logos/STORMGAUGE.png` — capital-case branding logos.
- `assets/logos/pluviometrics-main.png` — lowercase email-signature logo.
- All historical snapshot folders under `Superseeded/`, including `Superseeded/before-blank-screen-fix-20260430/`, `Superseeded/direct-calculator-route-before-fix/`, `Superseeded/index.html`, and the untracked `Superseeded/snapshot-20260430-082224/`.
- `nbc/`, `nbc-rainfall-tool-standalone/` (foreign nested clones, already ignored).
- `_staging_rebuild/`, `data/radar_archive/`, `data/_backup/` (now ignored, not deleted).
- All untracked working scripts: `scripts/lizard_inventory.py`, `scripts/lizard_precip_aoi_backfill.py`, `scripts/lizard_rastersource_inventory.py`, `scripts/radar_archive_manifest.py`, `scripts/radar_capture.py`, `scripts/radar_missing_frames_report.py`, `scripts/run_radar_capture.bat`, `scripts/create_pluviometrics_storage_structure.ps1`.
- All AEP / IFD / station / export / radar / BOM / RainViewer / routing / splash code.

## 6. Confirmation that protected files were unchanged
Verified via `git diff HEAD -- <path>` (empty output for each):
- `index.html` — no diff
- `src/modules/ui/controls.js` — no diff
- `export/buildExportModel.js` — no diff

Also confirmed via `Test-Path` that all live equivalents and logo assets remain on disk:
- `index.html`, `data/pluviometrics_rainfall_stations.json`, `data/pluviometrics_ifd_table.json`, `data/pluviometrics_ifd_cache.json`, `bom_ifd_cache.js`, `bom_northern_beaches_all_gauges.js`, `nsw_lga_boundaries.js`, `assets/logos/pluviometrics-main.png`, `Assets/Logos/ATMOS.png`, `Assets/Logos/PLUVIOMETRICS.png`, `Assets/Logos/STORMGAUGE.png` — all present.

The full change-set vs HEAD: 1 modification (`.gitignore`, +8 lines) plus 10 deletions. No other files modified, added, or renamed.

## 7. Remaining known risks (deliberately not addressed by this commit)
- **`Assets/Logos` vs `assets/logos` case-clash still unresolved.** GitHub Pages (case-sensitive) will see two distinct directories and one set of icon URLs will 404 once anything starts referencing the lowercase path beyond `pluviometrics-main.png`. Resolution requires a dedicated commit that also updates the references near `index.html` lines 269 and 291.
- **`switchPage` defined twice** — `index.html:5202` (shell variant, used by HTML buttons) and `src/modules/ui/controls.js:57` (module variant, used by `wireStartupControls`). Drift risk; needs consolidation.
- **`escapeHtml` defined twice** — `index.html:884` and `index.html:1322`, identical bodies, separate scopes. Should collapse to one definition during the index split.
- **`index.html` is still monolithic** — 5,258 lines / 822,863 bytes / 189 top-level functions / one 3,950-line inline `<script>` block (L1306-5256).
- **`export/buildExportModel.js` is split at file level only** — its own header acknowledges it reads `index.html` globals at call time; the coupling is unchanged.
- **Untracked `scripts/lizard_*.py` and `scripts/radar_*.py`** — substantive Python tools (~85 KB) still in limbo. Decision (commit / move to `scripts/experimental/` / ignore) deferred to a separate task per the cleanup brief.

## 8. Recommended next task
1. **Separate commit for the `Assets/Logos` → `assets/logos` case-consolidation**, including the matching reference updates around `index.html` lines 269 and 291 in the same commit. Verify on a case-sensitive checkout (or via GitHub Pages preview) before merging.
2. **Then build a function/dependency map** of `index.html` (top-level functions, callers, shared-state usage) before extracting any further modules. This is the prerequisite for safely tackling the `switchPage`/`escapeHtml` duplicates and the IFD/AEP extraction without introducing parity regressions.
