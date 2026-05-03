# Folder Structure and Index Split Audit

Repo: `C:\Users\fonzi\Weather App Folder` (clone of `Igo-Camping/pluvio-stormgauge`)
Branch: `staging` (HEAD = `0f0ffec` "Move Pluviometrics email signature logo to lowercase asset path")
Mode: READ-ONLY. No mutations made; only the report file and `reports/` directory were created.

---

## Summary

- **Total files audited (rough)**: ~3,236 files in working tree (excl. `.git`, `__pycache__`, `node_modules`); 48 tracked by git; 15 untracked entries reported by `git status --porcelain`. The bulk of the 3,236 is sub-trees `nbc/`, `nbc-rainfall-tool-standalone/`, `_staging_rebuild/`, `data/radar_archive/`, `Superseeded/`, all of which are gitignored or are nested clones.
- **Duplicate hash groups found**: 8 (see Section C).
- **Duplicate folders found**: 5 logical pairs/groups (`Assets/Logos` vs `assets/logos`; `Superseeded/` vs `Superseeded/snapshot-20260430-082224/` vs `Superseeded/before-blank-screen-fix-20260430/` vs `Superseeded/direct-calculator-route-before-fix/`; `data/` vs `Superseeded/` JSON; `nbc/` vs `nbc-rainfall-tool-standalone/`; `Superseeded/nbc/` vs `nbc/Superseded/` vs `nbc/Superseeded/`).
- **index.html size**: 5,258 lines, 822,863 bytes. Single inline JS block at lines 1306-5256 (≈3,950 lines, ~803 KB of JS in one `<script>`). Plus a smaller `<script type="module">` at lines 853-1305 (~452 lines). Embedded `<style>` at lines 29-260.
- **Recommended next step**: **Stop the bleeding on root-level dataset/JS duplication first** — delete (or move under `Superseeded/`) the root-level copies of `bom_ifd_cache.js`, `bom_northern_beaches_all_gauges.js`, `nsw_lga_boundaries.js` once `index.html` is updated to load from `data/`, and remove the three legacy `index_backup*.html` / `index.before-recovered-lost-work.html` from the repo root after confirming `Superseeded/` already snapshots them. **Do not start any further index.html splitting until that root cleanup ships** — the duplicate-folder/file noise is what is making the split risky.

---

## A. Structure map

| Group | Path | Purpose | Active? | Risk |
|---|---|---|---|---|
| Root (web app) | `index.html`, `styles.css`, `nsw_lga_boundaries.js`, `bom_ifd_cache.js`, `bom_northern_beaches_all_gauges.js`, `CNAME`, `.nojekyll` | Live GitHub Pages app for `pluviometrics.com.au`. `index.html` is the single-page entry point loading the three root JS data blobs and `styles.css`. | Active | Risky — root-level data blobs are duplicated under `Superseeded/` and inside nested clones (`nbc/`, `nbc-rainfall-tool-standalone/`). |
| Root (legacy index variants) | `index_backup.html` (812,120 B), `index_backup_1.html` (821,170 B), `index.before-recovered-lost-work.html` (879,671 B) | Old recovery snapshots from the April-May rebuild. Not referenced. `index.before-recovered-lost-work.html` is in `.gitignore`. | Inactive | Risky — easy to accidentally serve via Pages or deploy. Should live under `Superseeded/`. |
| Root (Python tooling, packaging) | `_patch_index.py`, `add_suburb.py`, `arcgis_packaging_runner.py`, `costing_api.py`, `costing_engine.py`, `costing_lookup.json`, `package_summary.xlsx`, `packaging_config.example.json`, `requirements-arcgis.txt`, `Stormwater Pipes (1).csv`, `Stormwater_Packaging_Tool_*.xlsm` | Stormwater pipe-packaging tool. Belongs to `D:\Packaging\` per CLAUDE.md; lives in this repo as historical artefacts. All listed in `.gitignore` (csv/xlsm by glob, plus explicit names). | Inactive (in this repo) | Unknown — may be the only on-disk copy of some files. Do not delete without checking `D:\Packaging\` parity. |
| Root (logs / scratch) | `bom-refresh.err.log`, `bom-refresh.out.log`, `pluvio-atmos-server.{out,err}.log`, `.tmp_zipbundle.txt`, `.tmp_zipfunc.txt`, `structure.txt`, `structure-atmos.txt`, `__pycache__/`, `New folder/` (empty) | Build / debug noise. `.log` glob-ignored. | Inactive | Safe to remove. |
| `Assets/` | `Assets/Logos/{ATMOS,PLUVIOMETRICS,STORMGAUGE}.png` (tracked) | Branding PNGs referenced by `index.html` lines 269 & 291 (`Assets/Logos/STORMGAUGE.png`). | Active | Risky — case duplicate of `assets/` (see Section B). |
| `assets/` (lowercase) | `assets/logos/pluviometrics-main.png` | Email-signature logo added in commit `0f0ffec`. NOT referenced anywhere in `index.html` (grep returned no hits in the served HTML). | Active for external use only | Risky — case-variant clash with `Assets/`. |
| `data/` | `pluviometrics_ifd_cache.json` (4,980,348 B), `pluviometrics_ifd_table.{json,csv}`, `pluviometrics_ifd_errors.json`, `pluviometrics_rainfall_stations.json`, `pluviometrics_stations.json`, `index.html` (1,977 B — directory landing stub), `_backup/2026-05-02/`, `radar_archive/`, `station-verification/` | Canonical pluviometrics datasets. `data/pluviometrics_ifd_table.json` IS tracked; the rest are gitignored. | Active for `enrich_ifd.py` and similar tooling. | Risky — every JSON also exists byte-identical under `Superseeded/` (see Section C). |
| `data/radar_archive/` | `README.md`, `SCHEMA.md`, `lizard_inventory/`, `logs/`, `metadata/`, `processed/`, `raw/`, `reports/`, `tiles/` | New radar capture pipeline (untracked, populated by `scripts/radar_capture.py` and `scripts/radar_archive_manifest.py`). | Active (newly built) | Unknown — outside test coverage and not in CI. |
| `data/_backup/2026-05-02/` | Untracked snapshot dir | Ad-hoc backup. | Inactive | Safe (orphan). |
| `data/station-verification/` | `verified_*`, `rejected_*` JSON, summary csv | Output of `scripts/verify_*` scripts. | Active | Safe. |
| `scripts/` | `enrich_ifd.py` (tracked); untracked: `consolidate_rainfall_stations.py`, `lizard_inventory.py`, `lizard_precip_aoi_backfill.py`, `lizard_rastersource_inventory.py`, `radar_archive_manifest.py`, `radar_capture.py`, `radar_missing_frames_report.py`, `refresh-bom-active-stations.mjs`, `verify_bom_rainfall_stations.py`, `verify_stations.py`, `create_pluviometrics_storage_structure.ps1`, `run_radar_capture.bat`, `README.md` | Backend tooling. Most are gitignored explicitly in `.gitignore`. | Active | Unknown — many recent additions are not under version control, so loss risk is real. |
| `src/modules/` | `exports/{buildExportModel,exportCsv,exportXlsx,exportPng,exportHelpers,workbookSheet}.js`, `radar/{bomRadar,rainviewerFallback}.js`, `stations/{stationLoader,stationMarkers}.js`, `map/{mapInit,mapLayers}.js`, `ui/{controls,theme}.js` | Already-extracted ES modules. Imported via `<script type="module">` at `index.html:853-867`. | Active | Safe — but main monolithic script (lines 1306-5256) still defines wrapper functions that delegate to these modules; the originals were not removed from the monolith, only re-routed. |
| `export/` (root) | EMPTY directory | Stub directory; appears to be a placeholder created during the 2026-04-29 export-module extraction but never used (the actual modules went to `src/modules/exports/`). | Inactive | Safe to delete. |
| `templates/` | `NBC Rainfall Calculator.xlsm` | Source of truth for the rainfall workbook template. Loaded by `index.html:1363` `RAINFALL_TEMPLATE_URL`. | Active | Safe. |
| `Superseeded/` (root, sic — typo of "Superseded") | Old `index.html` (785,159 B), copies of all root data JS, copies of all `data/*.json`, plus three sub-snapshots | Quarantine for legacy state. | Inactive | Risky — bytes-identical duplication of live datasets means a stale edit will not be obvious. |
| `Superseeded/before-blank-screen-fix-20260430/` | Single `index.html` (805,361 B) | Snapshot before commit `a962815`. | Legacy | Safe (clearly labelled). |
| `Superseeded/direct-calculator-route-before-fix/` | `index.html` (822,863 B) + `controls.js` (2,793 B) | Snapshot before commit `8f72312` ("Route ?view=calculator past Stormgauge splash"). The `index.html` is byte-identical to current root `index.html` (same SHA-256 `31C15C6781E2…`); only the bundled `controls.js` differs from `src/modules/ui/controls.js`. | Legacy | Risky — the snapshot's `index.html` is bit-for-bit equal to the live one. Either the rename "before fix" is misleading, or the live file is actually the *pre-fix* snapshot and the post-fix change lives only in `src/modules/ui/controls.js` (which is what the live HTML imports). |
| `Superseeded/snapshot-20260430-082224/` | Full mini-clone (index.html, scripts/, src/, styles.css, templates/, packaging .py + .json) | Daily snapshot. | Legacy | Safe — well-labelled. |
| `Superseeded/nbc/` | Single `index.html` (1,055,442 B) | Snapshot of the NBC sister tool. | Legacy | Safe. |
| `nbc/` | Full nested git repo (has its own `.git/`) for the NBC rainfall tool. Includes `Superseded/` AND `Superseeded/` (both spellings). | Foreign repo / submodule-like checkout | Active for NBC, but isolated. | Risky — entire directory is in `.gitignore` so it will never be committed here, but it occupies the working tree and confuses tooling. |
| `nbc-rainfall-tool-standalone/` | Another full nested git repo, same lineage as `nbc/`. Holds `bom_ifd_cache.js`, `bom_northern_beaches_all_gauges.js`, `nsw_lga_boundaries.js`, its own `index.html` (1,026,071 B), `styles.css` (31,701 B). | Foreign repo / standalone Pages deploy. | Active outside this repo. | Risky — `.gitignore` ignores it explicitly, but it duplicates ~22 MB on disk. |
| `_staging_rebuild/` | `nbc-staging/`, `pluvio-atmos-staging/`, `pluvio-stormgauge-staging/`, `pluviometrics-admin-staging/`, `pluviometrics-core/`, `pluviometrics-hub-staging/`, `reports/`, `scripts/`, `tests/` | Untracked, post-2026-05-02. Appears to be a partial staging-environment rebuild, possibly the seed of a polyrepo split. | Unknown | Risky — none of this is committed; if user reformats their drive it disappears. |
| `docs/`, `excel_vba/`, `extracted_vba/`, `reconstruction_packages/`, `relining_packages/` | Packaging-tool / VBA artefacts. All gitignored. | Inactive (this repo) | Safe. |
| `reports/` | THIS audit report. Created during this run. | Active (generated) | Safe. |

---

## B. Duplicate folders

| # | Paths | Why duplicate | Risk | Recommended action |
|---|---|---|---|---|
| B1 | `Assets/Logos/` (capitalised — tracked, holds `ATMOS.png`, `PLUVIOMETRICS.png`, `STORMGAUGE.png`) **vs** `assets/logos/` (lowercase — tracked, holds `pluviometrics-main.png`) | Git's `core.ignorecase=true` on Windows but `core.ignorecase` defaults differ across platforms. The git index has both spellings as separate entries. On Linux/macOS deployments these would be two distinct directories; on Windows NTFS they collide and only the case that wrote last wins. `index.html:269,291` references `Assets/Logos/STORMGAUGE.png`. The lowercase tree is an external-use email-sig asset only. | High — a Linux Pages build (Cloudflare/Netlify) will treat the two as separate dirs and one image set will appear missing. | Pick one canonical case (recommend lowercase `assets/logos/` to follow web convention) and `git mv` the four logo PNGs into it. Update `index.html` references in the same commit. |
| B2 | `Superseeded/` (root) — typo for "Superseded" — **vs** `nbc/Superseded/` **vs** `nbc/Superseeded/` (both spellings inside the nested NBC repo) | Mixed spellings of the same archive concept. | Medium — confusing, dilutes searchability ("which Superseeded is the canonical archive?"). | Rename root to `Superseded/` (correct spelling). Inside `nbc/`, the two spelled variants belong to a foreign repo and are not your problem. |
| B3 | Root-level data blobs `bom_ifd_cache.js`, `bom_northern_beaches_all_gauges.js`, `nsw_lga_boundaries.js` **vs** identical copies in `Superseeded/` **vs** identical copies in `nbc/` and `nbc-rainfall-tool-standalone/` | The same ~22 MB of data exists at four locations. | High — any refresh script that updates one copy leaves the other three stale, and tracking which `index.html` reads which is non-obvious. | Treat root copies as canonical; delete the `Superseeded/` copies (they add nothing the snapshot folders don't already have). The two nested-repo copies are not under this repo's control. |
| B4 | `data/*.json` (six files) **vs** `Superseeded/*.json` (the same six, all byte-identical, see Section C) | Snapshot taken at 2026-04-27 and never pruned. | Medium — risk of editing the wrong copy during data-pipeline work. | Delete the `Superseeded/` JSON copies. They are redundant: `Superseeded/snapshot-20260430-082224/` already provides a labelled point-in-time snapshot. |
| B5 | `export/` (root, empty) **vs** `src/modules/exports/` (populated) | The `export/` directory was created during the 2026-04-29 extraction but never received files; the modules were placed at `src/modules/exports/` instead. | Low — empty stub. | Remove the empty `export/` directory. |

Honourable mentions (not strictly duplicates but worth flagging):
- `New folder/` — empty directory at the repo root, presumably an accidental Windows Explorer creation. Safe to remove.
- `Superseeded/index.html` (785,159 B) is *older* than `Superseeded/before-blank-screen-fix-20260430/index.html` (805,361 B) by file size — naming does not encode chronology.

---

## C. Duplicate files (SHA-256, first 12 chars)

Computed via PowerShell `Get-FileHash -Algorithm SHA256` on candidate set. Excluded `.git/`, `node_modules/`, `__pycache__/`, `build/`, `dist/`. All sizes in bytes.

| Group | SHA-256 (first 12) | Size (B) | Paths | Risk |
|---|---|---|---|---|
| C1 | `31C15C6781E2` | 822,863 | `index.html` **=** `Superseeded/direct-calculator-route-before-fix/index.html` | High — see B5 footnote: the live file is byte-identical to a snapshot labelled "before fix". Either the snapshot is mislabelled or the live file is actually pre-fix and the routing fix lives only in `src/modules/ui/controls.js:79-81` (which is where the `?view=calculator` parsing actually sits — confirmed). The label is misleading. |
| C2 | `30D7A3EFACDA` | 13,929,665 | `bom_ifd_cache.js` **=** `Superseeded/bom_ifd_cache.js` | Medium — refresh-script ambiguity. |
| C3 | `C8C6EAD9BEFE` | 7,341,795 | `bom_northern_beaches_all_gauges.js` **=** `Superseeded/bom_northern_beaches_all_gauges.js` | Medium. |
| C4 | `121E713E7283` | 1,362,032 | `nsw_lga_boundaries.js` **=** `Superseeded/nsw_lga_boundaries.js` | Medium. |
| C5 | `27F55D2B4B7C` | 6,444,969 | `data/pluviometrics_ifd_table.json` **=** `Superseeded/pluviometrics_ifd_table.json` | Medium. |
| C6 | `71E5E96E73C3` | 4,980,348 | `data/pluviometrics_ifd_cache.json` **=** `Superseeded/pluviometrics_ifd_cache.json` | Medium. |
| C7 | `4A83F4456980` | 586,588 | `data/pluviometrics_rainfall_stations.json` **=** `Superseeded/pluviometrics_rainfall_stations.json` | Low. |
| C8 | `43DF60E38B99` | 4,045 | `data/pluviometrics_stations.json` **=** `Superseeded/pluviometrics_stations.json` | Low. |

Tiny pair (still exact dupes): `data/pluviometrics_ifd_errors.json` and `Superseeded/pluviometrics_ifd_errors.json` (`ACE10A2C9CA9`, 419 B).

Logos surveyed had **no exact duplicates** between `Assets/Logos/` and `assets/logos/` — they hold different PNGs (case-variant folder, different file content). `pluviometrics-main.png` (1,963,871 B, hash `BCE709476F1B`) is unique to lowercase. The capitalised `PLUVIOMETRICS.png` (376,222 B, `3B59227B7D44`) is its own thing.

---

## D. Near duplicates

### D1. The four root `index.html` siblings

| File | Size (B) | Lines | SHA-256 (first 12) | Notes |
|---|---:|---:|---|---|
| `index.html` | 822,863 | 5,258 | `31C15C6781E2` | Live. |
| `index_backup.html` | 812,120 | 4,938 | `999BD9E13A3B` | ~10 KB smaller. |
| `index_backup_1.html` | 821,170 | 5,154 | `7A852A196FF1` | ~1.7 KB smaller, ~100 fewer lines. Likely the snapshot just before the relining-restore commit `dbad1a9`. |
| `index.before-recovered-lost-work.html` | 879,671 | 5,934 | `D29C59D940A1` | ~57 KB *bigger* than live and 676 lines longer. Indicates substantial code excision happened between this snapshot and current. Listed in `.gitignore`. |

All four are content-similar (same heading, same `<style id="sg-theme-system">`, same boot script structure) but no two share a hash. None are referenced by build tooling. Recommendation: move all three non-live ones into `Superseeded/` (or delete) once you confirm they're nothing the user wants to diff against.

### D2. Snapshot index variants

`Superseeded/before-blank-screen-fix-20260430/index.html` (805,361 B) vs `Superseeded/snapshot-20260430-082224/index.html` (786,937 B) vs `Superseeded/index.html` (785,159 B) vs `Superseeded/nbc/index.html` (1,055,442 B). All distinct hashes, all distinct sizes. The NBC one is much larger because the NBC tool has a different UI surface.

### D3. Dataset JSON (covered in C5–C8)

No "near" duplicates beyond the exact ones — a refresh would change byte counts immediately.

### D4. Script suffix variants

Stormwater pipes CSV: `Stormwater Pipes (1).csv` (25,366,671 B) vs `Stormwater_Packaging_Tool_fixed_working.xlsm` (23,072,063 B) vs `Stormwater_Packaging_Tool_inspect_copy.xlsm` (23,133,727 B) vs `Stormwater_Pipes_with_suburb.csv` (25,694,211 B). These are packaging-tool artefacts, not part of the pluviometrics web app — out-of-scope but worth purging from this repo (all glob-ignored anyway).

### D5. Module vs in-monolith function definitions

Several functions defined in `src/modules/*.js` ALSO have wrapper definitions inside `index.html` (lines 5202-5247 etc.) that simply forward to `window.<module>.<fn>(...)`. This is intentional bridging during the split, but it means a reader searching for "where is `switchPage` defined?" gets two hits: `index.html:5202` (wrapper) and `src/modules/ui/controls.js:57` (real impl). Both have the same signature.

---

## E. index.html analysis

- **Path**: `C:\Users\fonzi\Weather App Folder\index.html`
- **Lines**: 5,258
- **Bytes**: 822,863
- **Top-level function definitions** (matched `^(function|async function) NAME(`): **189**

### Top-level structure (line ranges)

| Lines | Section | Notes |
|---|---|---|
| 1-2 | DOCTYPE + `<html lang="en">` | |
| 3-263 | `<head>` | |
| 9 | Inline theme bootstrap script | Sets `data-theme` before paint. |
| 12-22 | External CDN links + local data scripts | Leaflet, Chart.js, Hammer, Chartjs-plugin-zoom, html2canvas, plus `nsw_lga_boundaries.js`, `bom_northern_beaches_all_gauges.js`, `bom_ifd_cache.js`, `styles.css`. |
| 29-260 | `<style id="sg-theme-system">` | 232 lines of theme CSS *inside* `index.html`, despite `styles.css` already existing externally (34,449 B). CSS extraction is therefore PARTIAL. |
| 264-850 | `<body>`: header, page shells, packaging UI, AEP UI | |
| 269 | `<img src="Assets/Logos/STORMGAUGE.png">` | First logo ref. |
| 284-285 | Page-nav buttons (`switchPage('aep')`, `switchPage('home')`) | |
| 289-317 | `<div id="page-home">` (splash) | |
| 318-503 | `<div id="page-aep">` (calculator) | |
| 851-852 | SheetJS + xlsx-js-style CDN scripts | |
| 853-1305 | **`<script type="module">`** | Imports all `src/modules/*.js`, exposes them on `window`, dispatches `atmos-modules-ready`. Also contains the entire **packaging / relining UI block** (lines 882-1303 — restored from commit `14e7277` per the comment at L882). This module script is therefore **mixed-purpose**: half module-bridge, half packaging logic. |
| 884 | `function escapeHtml` (#1) | **Duplicate** with line 1322. |
| 1306-5256 | **Main inline `<script>`** (~3,950 lines, classic globals) | Contains all 189 top-level functions excluding the packaging block. |
| 1322 | `function escapeHtml` (#2) | **Duplicate** with line 884. Both bodies are identical. The second definition wins because it appears later in source order. |
| 5257-5258 | `</body></html>` | |

### Functional sections inside the main script (line ranges, by grep clustering)

| Lines | Section | Key functions |
|---|---|---|
| 1306-1320 | Config/constants | `API`, `PLUVIOMETRICS_RAINFALL_STATION_DATA_URL`, `ALL_DURATIONS`, `DUR_LABELS` |
| 1322-1397 | HTML helpers | `escapeHtml` (dup), `encodeInlineArg`, `decodeInlineArg` |
| 1339-1397 | Module-level `let` state | `allStations`, `selected`, `markers`, `mode`, `lastResults`, etc. — ~30 globals |
| 1399-1577 | Analysis cache subsystem | `loadAnalysisCache`, `saveAnalysisCache`, `addAnalysisToCache`, `addSavedAnalysis`, `deleteAnalysisFromCache`, `generateDefaultAnalysisName`, `updatePreviousAnalysisDropdown`, `saveCurrentAnalysis`, `loadPreviousAnalysis`, `deleteSelectedCacheEntry` |
| 1579-1670 | Atmos map / radar bootstrap (delegates to modules) | `ensureAtmosMapSetup`, `initAtmosMap`, `ensureLgaBoundaryLoad`, `invalidateAtmosMap`, `queueAtmosRadarLayer`, `initAtmosRadarLayer` |
| 1672-1714 | Init + station loading (delegates to `stationLoader`) | `init`, `setStatus`, `loadStations`, `loadPluviometricsRainfallStationDataset`, `extractDataIdentifierId`, `normaliseConsolidated*` |
| 1714-1862 | Active-gauge cache & MHL filtering | `loadActiveGaugeCache`, `persistActiveGaugeCache`, `getCachedActiveGaugeState`, `setCachedActiveGaugeState`, `fetchMhlTimestampPresence`, `hasRecentGaugeReadings`, `filterStationsByRecentReadings` |
| 1854-2027 | LGA dropdown / station/map filter | `buildLgaDropdown`, `getLGA`, `getStationSourceLabel`, `getBomStationNumber`, `canAnalyseStation`, `onLgaChange`, `selectLgaFromMap`, `stationMatchesFilters`, `getFilteredStations`, `getDisplayStations`, `getFilteredDisplayStations`, `syncFilteredStationViews`, `filterList`, `renderList` |
| 2028-2107 | Map markers (delegates to `stationMarkers`) | `getStationMarkerDeps`, `plotAllMarkers`, `isBomRainGauge`, `getBomRainfallMarkerColour`, `getBomIfdKey`, `loadBomRainfallReferenceGauges`, `buildBomRainfallPopup`, `plotBomRainfallMarkers`, `setMarkerStyle`, `findDisplayStationById`, `selectStation` |
| 2109-2386 | UI / tab logic | `ensureRainfallTemplateLoaded`, `getUiControlDeps`, `setMode`, `switchTab`, `updateRecalcButton`, `setResultsTabMode`, `showSelectedAnalysisReadyState`, `showTopSiteReadyState`, `recalcCurrentTab`, `getAnalysisWindow`, `getCurrentAnalysisContext`, `getTopSiteAnalysisKey`, `renderCachedCurrentTab`, `switchRTab` |
| 2344-2386 | AEP classification | `classifyAEP`, `aepToARI`, `interpretation` |
| 2388-2548 | **Main analysis driver** | `async function runAnalysis()` (~160 lines) — the rainfall calculation entry point. |
| 2548-2572 | NBC station guards | `isProtectedNbcStation`, `getNbcSubStations`, `onNbcSubChange` |
| 2573-2700 | MHL/BoM rainfall fetch | `fetchMhlData`, `fetchStationRainfall` |
| 2699-2742 | Rolling-max core (Lessons Learned: the `>` not `>=` and `Math.floor` rules live here) | `isDurationSupportedForInterval`, `calcRollingMax` |
| 2743-2914 | QC pipeline | `fetchWeather`, `degToCompass`, `applyRainfallQc`, `_bomDataDiag`, `_isBomCumulative`, `_bomCumulativeToIncrements`, `applyBomQc` |
| 2915-2997 | Same-day fetch & per-station analyse | `fetchRainfallSinceMidnight`, `analyseStation` |
| 2998-3286 | Top-Per-Site / Top-Durations rendering | `runTopPerSite`, `aepStringToProb`, `durationLabelToMinutes`, `getTopSiteSortValue`, `sortTopPerSiteBy`, `topSiteHeader`, `openTopSiteDailyTotals`, `renderTopPerSite`, `renderCompareChart`, `runTopDurations`, `renderTopDurations` |
| 3460-3611 | Daily totals + hourly drill-down | `runDailyTotals`, `renderDailyTotals`, `showDailySubTab`, `openHourlyBreakdown`, `renderHourlyTable` |
| 3613-3922 | Single-station results UI + chart | `renderResults`, `renderChart`, `renderRainfallTotals`, `downloadRainfallTotalsPNG` |
| 3923-3992 | IFD render + sort helpers | `renderIFDTable`, `getSortedTopSiteResults`, `getSortedTopDurationResults` |
| 3994-4117 | Export model row builders | `buildDailyRows`, `buildHourlyRows`, `buildIfdRows`, `buildIfdDepthReferenceRows`, `getIfdDepthForAep`, `buildGaugeDataRows`, `normaliseGaugeName`, `getTemplateGaugeName` |
| 4118-4404 | XLSX export (template + raw) | `exportAllUsingTemplate`, `buildMainDisplaySheet`, `exportAllXlsx` |
| 4406-4501 | API plumbing + IFD loaders | `api`, `loadStationIfd`, `loadIfdData` |
| 4503-4612 | AEP math | `aepRarity`, `calcAEP`, `interpretAEP` |
| 4614-4663 | Tiny formatters / loading-overlay UI | `fmtDt`, `fmtTime`, `tempIcon`, `showLoad`, `setLoadTxt`, `hideLoad`, `closeResults` |
| 4665-4922 | "Other monitors" subsystem | `loadOtherMonitors`, `fetchOtherStations`, `filterMonitors`, `showLevelChart` |
| 4924-5174 | LGA boundary geometry | `loadAllLgaBoundaries`, `getFeatureLgaName`, `formatLgaBoundaryName`, `getFeatureBounds`, `bboxOverlaps`, `getBoundaryPointKeys`, `addLgaAdjacency`, `buildLgaBoundaryColourMap`, `getLgaLatLngBounds`, `pointInRing`, `pointInGeometry`, `lookupLgaByPoint`, `assignStationsToLgas`, `drawLgaBoundary` |
| 5175-5196 | Critical-assets state (NOT pluviometrics) | Constants + 7 `let` variables; appears to be carry-over from packaging-tool monolith. |
| 5198-5247 | Page navigation + theme (delegates to `uiTheme` / `uiControls`) | `switchPage`, `showStormgaugePageShell`, `applyTheme`, `toggleTheme`, `queueAtmosUiStartup` |
| 5250-5252 | DOM-ready wiring | `document.addEventListener('DOMContentLoaded', queueAtmosUiStartup)` |

### Inline `<script>` blocks

| Range | Type | Purpose |
|---|---|---|
| L9 | inline | Theme bootstrap (sync). |
| L13-18 | external src | CDN libs. |
| L17 | inline | `Chart.register(window.ChartZoom)`. |
| L19-21 | external src | Local data blobs. |
| L851-852 | external src | XLSX libs. |
| L853-1305 | inline (`type="module"`) | Module imports + window-bridging + restored packaging block. |
| L1306-5256 | inline (classic) | Main app monolith. |

### Duplicated function definitions

- `escapeHtml` defined at L884 AND L1322 (identical bodies). Second one wins. **Risk**: if either is edited without the other, behaviour depends on which scope the call is made from (module scope at L853-1305 vs main script at L1306-5256 are separate JS scopes — `escapeHtml` at L884 is only visible to the packaging code; L1322 version is visible to the rest). Currently both bodies are identical, so this is latent rather than actual.

No other top-level function names are duplicated within the file. Wrapper-vs-module duplicates (e.g. `switchPage`, `setMode`, `closeResults`, `setStatus`, `showLoad`, `hideLoad`, `applyTheme`, `toggleTheme`, `loadStations`, etc.) exist *across* the index.html and `src/modules/*.js` boundary but not within `index.html` itself.

### Routing logic location (note for the user)

The `?view=calculator` past-splash routing introduced by commit `8f72312` is NOT in `index.html` — it lives in `src/modules/ui/controls.js:79-81`:
```
const params = new URLSearchParams(ctx.document.location.search);
if (params.get('view') === 'calculator') initialPage = 'aep';
```
So the live `index.html` (hash `31C15C6781E2`) is byte-identical to the snapshot `Superseeded/direct-calculator-route-before-fix/index.html` because the fix went into the module, not the HTML — the snapshot label is therefore correct *for the HTML file* but misleading *for the app behaviour*.

---

## F. Split status

| Module | Path | Bytes | Used in `index.html`? | Depends on globals? |
|---|---|---:|---|---|
| `buildExportModel` | `src/modules/exports/buildExportModel.js` | 8,682 | Yes — imported L854, exposed as `window.buildExportModel` L867. The module's source comment explicitly says it reads globals (`lastResults`, `lastTopDurResults`, `lastDailyData`, `topSiteResultsCache`, `topSiteSort`, `selected`, `currentTab`, `DUR_LABELS`, `aepToARI`, `getSortedTopSiteResults`) at call time. | **Yes — heavy global coupling.** |
| `exportCsv` | `src/modules/exports/exportCsv.js` | 4,993 | Yes — imported L855 as `exportCSV`. | Likely consumes `buildExportModel()` output. |
| `exportXlsx` | `src/modules/exports/exportXlsx.js` | 12,255 | Yes — imported L856 as `exportXLSX`. | Same. |
| `exportPng` | `src/modules/exports/exportPng.js` | 2,024 | Yes — imported L857 as `exportPNG`. | Same. |
| `exportHelpers` | `src/modules/exports/exportHelpers.js` | 971 | NOT imported by `index.html` directly. Likely imported by sibling exporters. | Unknown. |
| `workbookSheet` | `src/modules/exports/workbookSheet.js` | 261 | Yes — imported L858 as `appendWorkbookSheet`. | Unknown. |
| `bomRadar` | `src/modules/radar/bomRadar.js` | 4,007 | Yes — imported L859 namespace, used L1635 (`createAvailableBomRadarLayer`). | Receives `L` (Leaflet) by injection — clean. |
| `rainviewerFallback` | `src/modules/radar/rainviewerFallback.js` | 2,117 | Yes — imported L860 namespace, used L1650 (`createRainviewerFallbackLayer`). | Clean. |
| `stationLoader` | `src/modules/stations/stationLoader.js` | 7,092 | Yes — namespace import L861, called from index.html via wrappers (L1689, L1695, L1699, L1703, L1707, L1711, L2065). | Receives a deps bundle (`getStationLoaderDeps()` — index.html L1714) — clean injection. |
| `stationMarkers` | `src/modules/stations/stationMarkers.js` | 7,916 | Yes — namespace import L862, wrappers at L1997, L2049, L2053, L2057, L2069, L2073, L2077. | Same `getStationMarkerDeps()` (L2028) injection — clean. |
| `mapInit` | `src/modules/map/mapInit.js` | 256 | Yes — L863, used L1599 (`createAtmosMap`). | Clean (one factory). |
| `mapLayers` | `src/modules/map/mapLayers.js` | 786 | Yes — L864, used L1600 (`addAtmosBaseLayer`), L1601 (`ensureAtmosRadarPane`). | Clean. |
| `ui/theme` | `src/modules/ui/theme.js` | 905 | Yes — L865 namespace, wrappers L5234, L5237. | Clean. |
| `ui/controls` | `src/modules/ui/controls.js` | 2,988 | Yes — L866 namespace, used L5242, L5246; also owns `switchPage`/`setMode`/`switchTab`/`showLoad`/`setLoadTxt`/`hideLoad`/`closeResults`/`wireStartupControls` and the `?view=calculator` routing. | Receives `ctx` deps bundle — clean. |

Already-extracted data files (under `data/`): `pluviometrics_ifd_table.json` (tracked), the rest are gitignored runtime caches. They are NOT loaded by `index.html` — `index.html` still loads `bom_ifd_cache.js`, `bom_northern_beaches_all_gauges.js`, `nsw_lga_boundaries.js` from the **root**, not from `data/`. So the data-folder migration is started but not wired up.

Helper scripts (`scripts/*.py`, `scripts/*.mjs`): all populate `data/*` and `data/station-verification/*`. None are imported by the web app. Standalone.

---

## G. Split plan status

| Step | Plan | Status | Evidence |
|---|---|---|---|
| 1 | CSS extraction | **Partial** | `styles.css` exists (34,449 B) and is linked at L22, but `index.html` STILL contains an inline `<style id="sg-theme-system">` block at L29-260 (232 lines, ~5 KB). Either move that block into `styles.css` or accept it as bootstrap-critical CSS — but right now both files claim ownership of theme CSS. |
| 2 | Export logic extraction | **Done (with caveat)** | All exporters are in `src/modules/exports/`. **Caveat**: `buildExportModel.js` still reads index.html globals at call time (its own source comment admits this) — the module is extracted in *file* terms but not in *coupling* terms. A breakage in index.html state names would silently break exports. |
| 3 | Data loading extraction | **Partial** | `stationLoader.js` is extracted and wired (clean dep injection). But the three big root-level data blobs (`bom_ifd_cache.js`, `bom_northern_beaches_all_gauges.js`, `nsw_lga_boundaries.js`) are still loaded as global script tags at L19-21 and the JSON datasets in `data/` are not wired into the page. |
| 4 | IFD logic extraction (only if safe) | **Not started** | All IFD code lives in index.html: `loadStationIfd` (L4429), `loadIfdData` (L4478), `aepRarity` (L4503), `calcAEP` (L4513), `interpretAEP` (L4602), plus the `bom_ifd_cache.js` global blob. Per Lessons Learned, AEP/ranking logic is parity-sensitive — any extraction here is high-risk. |
| 5 | Radar logic extraction | **Done** | `bomRadar.js` + `rainviewerFallback.js` carry the layer factories; index.html L1623-1670 is a thin wrapper. Recent commits `d0244fa` and `a4409f0` show the fallback was actively being fixed inside the module — good sign that the boundary holds. |
| 6 | Routing extraction (last) | **Done** | `wireStartupControls` in `src/modules/ui/controls.js:76-84` owns the `?view=calculator` parsing; `switchPage` is also in the module. Index.html keeps a thin `switchPage` wrapper at L5202 because there is also a Stormgauge-specific `showStormgaugePageShell` page-shell variant at L5221 that's NOT in the module — meaning two `switchPage`-shaped functions exist with different code paths (the wrapper overrides the module's `switchPage` for callers in index.html). **Risky** — the call to `switchPage('aep')` from L284's `<button onclick>` resolves to the index.html version (lexical scope), while the module's own internal `switchPage` is what `wireStartupControls` invokes via `ctx.switchPage`. This dual identity is a footgun. |

---

## H. Risk register

| # | Risk | Location | Severity | Why | Recommendation |
|---|---|---|---|---|---|
| H1 | Case-variant logo folders break on case-sensitive deploys | `Assets/Logos/` + `assets/logos/` | **High** | Cloudflare Pages / Netlify build on Linux (case-sensitive). The git index has both, but on a real Linux build only one will resolve depending on what `index.html` literally requested. | Pick one canonical case (`assets/logos/`), `git mv` PNGs in, update `index.html` references. Test on case-sensitive FS before merging. |
| H2 | Four `index.html` variants at root | repo root | **High** | A future GitHub Pages config change or a careless developer could publish the wrong one. `.gitignore` ignores `index.before-recovered-lost-work.html` but `index_backup.html` and `index_backup_1.html` are tracked. | Move all three non-live HTMLs to `Superseeded/` (or delete). Stage the deletion separately from any code change. |
| H3 | Snapshot label "before fix" identical to live file | `Superseeded/direct-calculator-route-before-fix/index.html` (`31C15C6781E2`) vs `index.html` (`31C15C6781E2`) | Medium | Confuses anyone bisecting. The actual fix is in `src/modules/ui/controls.js:79-81`. | Rename the snapshot folder to reflect that the fix lives in the module, e.g. `Superseeded/before-controls-route-fix-20260503/` and include the *old* `controls.js` there (which is already done). |
| H4 | Six-way dataset duplication | `data/*.json` ↔ `Superseeded/*.json` (and root `*.js` blobs in three places) | **High** | A `scripts/enrich_ifd.py` run will refresh `data/`, leaving `Superseeded/` stale. Future audit-by-eyeball will flag the divergence as suspicious when it's actually expected. | Delete the `Superseeded/` JSON / JS copies. The dated snapshot directory already preserves a labelled point in time. |
| H5 | Monolithic main `<script>` (3,950 lines) | `index.html` L1306-5256 | **High** | 189 top-level functions in one classic-script scope means: no module isolation, debugging globals across IDE search hits, edit conflicts, and parity-sensitive code (AEP / rolling-max) buried in a sea of UI code. | Continue the split but **only by extracting whole subsystems with clean dep boundaries** (LGA boundaries module, analysis-cache module). Never extract AEP / `calcRollingMax` / QC code without a parity test harness. |
| H6 | `escapeHtml` defined twice | L884 (module-scope) + L1322 (classic-scope) | Low | Bodies are currently identical. Latent risk if one is updated. | Delete the L884 copy and import `escapeHtml` from the L1322 scope into the packaging block — but the two scripts are separate scopes so import isn't trivial. Easiest: factor a tiny `src/modules/util/html.js` and import it into both. |
| H7 | Export modules read globals at call time | `src/modules/exports/buildExportModel.js` (and downstream) | **High** | Renaming `lastResults` or `topSiteSort` in index.html silently breaks XLSX/CSV/PNG exports with no compile error. Lessons Learned already records "Top Intensity Per Site ranking breaks on string comparison". | Make `buildExportModel` accept a state object: `buildExportModel(state)` where `state` is built explicitly inside index.html. Then the contract is enforced. |
| H8 | Radar fallback is the only remaining path on most browsers | `src/modules/radar/{bomRadar,rainviewerFallback}.js` | Medium | Two recent commits (`d0244fa`, `a4409f0`) fixed RainViewer zoom — meaning this is fragile. | Add a unit test that asserts `createRainviewerFallbackLayer({ map, options })` returns a layer that addTo's without throwing at zoom 6, 10, 14. |
| H9 | AEP / IFD parity not under test | `index.html` L4503-4612 + `bom_ifd_cache.js` (13.9 MB blob) | **High** | Lessons Learned: `calcRollingMax` parity rules (`>` not `>=`, `Math.floor` not `Math.round`), Top Site rank parsing. Any extraction of this code without locked-in numeric tests will reintroduce the same bugs. | Before any further IFD/AEP extraction, write 5-10 frozen test cases (station + date range + expected depth + expected AEP %) against the live monolith, then port them to module form. |
| H10 | Two `switchPage` functions of different shape | `index.html:5202` (page shell variant) and `src/modules/ui/controls.js:57` (module variant) | Medium | The HTML buttons (L284-310) call the index.html one (lexical scope wins). `wireStartupControls` uses `ctx.switchPage` which is whichever the index.html ctx-builder hands it. If they drift, splash routing and on-page navigation will diverge. | Decide which is canonical. Recommend keeping the module version and removing the index.html wrapper (binding `window.switchPage = uiControls.switchPage` instead). |
| H11 | Untracked critical scripts | `scripts/lizard_*.py`, `scripts/radar_*.py`, `scripts/create_pluviometrics_storage_structure.ps1`, `scripts/run_radar_capture.bat` | Medium | These are explicitly gitignored (`scripts/refresh-bom-active-stations.mjs`, `scripts/verify_*.py`, `scripts/consolidate_rainfall_stations.py`) by the broad `scripts/` ignore exceptions, but newer additions (`lizard_*`, `radar_*`) appear to NOT be ignored — they show as `??` in git status. They are sitting outside version control. | Decide: either commit them (remove from gitignore-by-glob) or formally exclude them. Right now they are in limbo. |
| H12 | `_staging_rebuild/` is uncommitted polyrepo seed | `_staging_rebuild/` (untracked) | Medium | Contains six staging-shape sub-projects that look like an in-progress repo split. None of it is under any git history. | Either initialise it as a separate repo set, or delete it. Leaving it in working tree obscures what is "live" vs "scratch". |
| H13 | Foreign nested git repos in the working tree | `nbc/.git/`, `nbc-rainfall-tool-standalone/.git/` | Medium | Both are full clones of other repos sitting inside this one. They confuse `find` / IDE / search tooling and store ~50 MB of duplicate git objects. | Move them out of this working tree (e.g. to `D:\NBC\` and `D:\NBC-standalone\`). They are already gitignored here. |
| H14 | Radar archive + lizard inventory data is uncommitted and large | `data/radar_archive/`, `data/_backup/2026-05-02/` | Low (data is regenerable) | Untracked. Loss on disk failure. | If regeneration is cheap (lizard inventory pull), accept the risk. If it represents real captured radar tiles, snapshot to backup. |
| H15 | The `Superseeded` typo | `Superseeded/` (root), `nbc/Superseeded/` | Low | Search-discoverability ("supersed" misses both spellings depending on regex). | Cosmetic — rename to `Superseded/` if you ever do a cleanup pass. Don't bother in isolation. |

---

## End of report

Generated read-only on branch `staging` at HEAD `0f0ffec`. Only writes performed:
1. `mkdir reports/`
2. This file: `reports/FOLDER_STRUCTURE_AND_INDEX_SPLIT_AUDIT.md`
