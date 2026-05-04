# NBC Web Tool — Functionality Parity Audit

**Audit target:** `C:\Users\fonzi\Weather App Folder\nbc\index.html` (10,254 lines, 1.06 MB, last modified 2026-04-30)

**Reference A — "Monolithic main index.html":** `C:\Users\fonzi\Weather App Folder\index.html` (4,976 lines, 805 KB) — this is the *April 16 monolith* most recently restored by commits `41be128` and `dbad1a9`. It contains ONLY a relining packaging tool — no reconstruction, no amplification, no proximity, no top-up, no ZIP export, no priority engine.

**Reference B — Streamlit packaging tool:** `D:\Packaging\scripts\` —
 - `cost_engine.py` (1,190 lines) — costing engine with relining + reconstruction + amplification
 - `ui.py` (1,209 lines) — Streamlit UI with three tabs, cost subtab, edit subtab
 - `populate_forward_works.py` (190 lines) — consumes `relining_packages.zip`

**Audit scope:** read-only. No files have been modified.

**Important framing:** Reference A (the root `index.html`) is *less* feature-rich than the current `nbc/index.html`. The functional baseline that exposes most of the gaps below is **Reference B (D:\Packaging Streamlit tool)**, which is the only version that ever implemented full reconstruction and amplification packaging.

---

## Summary table

| # | Area | Status |
|---|---|---|
| 1 | Input handling | PARTIAL |
| 2 | Costing logic | PARTIAL |
| 3 | Package generation | PARTIAL |
| 4 | Proximity / clustering | PRESENT |
| 5 | Top-up logic | PRESENT |
| 6 | Priority logic | PRESENT |
| 7 | Manual editing workflow | MISSING |
| 8 | ZIP / output generation | PARTIAL |
| 9 | Forward works compatibility | PRESENT |
| 10 | UI parity | PARTIAL |

---

## 1. Input handling

| Item | Status | Notes |
|---|---|---|
| Asset CSV upload | PRESENT | `loadReliningAssetsFile` at `nbc/index.html:5992`; control `#pkgAssetsFile` at line 882 |
| Rates upload (XLSX/embedded) | PRESENT | `loadReliningRatesFile` at line 6037; control `#pkgRatesFile` at line 886; reads `_Tables` sheet, filters `SP6 Pipeline Relining` |
| Required column mapping | PRESENT | `resolveSuburbColumn` (line 4202), `getReliningDiameterValue` (4309), `getReliningLengthValue` (4326), `getValueByAliases` aliases for diameter/length/condition (line 4252) |
| Condition filtering | PRESENT | `pkgReliningMode` selector (line 900) → `getReliningRowsForMode` (4403) supports Cond 7, Cond 8, Cond 7+8 |
| Diameter filtering | PARTIAL | Hard-coded floor `MIN_RELINING_DIAMETER_MM = 300` (line 1564) silently drops anything <300mm; no UI to override. Streamlit has no fixed floor and instead uses the rate table to decide eligibility. Impact: small-diameter relining candidates are excluded even if a rate exists. Recommended fix: drop the floor and rely on rate-match failure (as Streamlit does), or expose as a UI input. **Source for fix: `D:\Packaging\scripts\cost_engine.py`.** |
| Suburb / LGA filtering | PARTIAL | Suburb is *resolved* (alias chain + address parsing in `resolveReliningSuburb` at line 4495) but cannot be *filtered on* by the user. Streamlit also has no filter — likely OK. |
| Length and cost calculations | PRESENT | `normaliseReliningCandidateRow` line 4509–4561 computes `lengthM`, `ratePerM`, `pipeCost` |

---

## 2. Costing logic

| Item | Status | Notes |
|---|---|---|
| Relining costing | PRESENT | `getReliningRateInfoForRow` line 4344; matches diameter, length band, then median/lowest/vendor across panel rows |
| Reconstruction costing | **MISSING** | No SP7 lookup, no `_get_pipe_rate`, no `_get_tiered_rate`, no `calc_reconstruction_cost`. Only RLN flow exists. **Reference: `D:\Packaging\scripts\cost_engine.py:425`** (`calc_reconstruction_cost`). Impact: web tool cannot quote reconstruction works. Recommended fix: port `calc_reconstruction_cost` and the SP7 helpers from cost_engine.py. **Source: D:\Packaging only — never existed in any monolithic index.html.** |
| Amplification costing | **MISSING** | Streamlit reuses `get_reconstruction_rate` for amplification (`ui.py:1201`). Web tool has neither. **Source: D:\Packaging.** |
| SP6 / rate lookup behaviour | PRESENT | `getReliningRateInfoForRow` parses descriptors, length bands, supports `costMode = median \| lowest \| contractor`. Functional parity with `lookup_sp6_rate` (`cost_engine.py:205`). |
| Provisional traffic control allowance | **BROKEN** | Code path exists at `nbc/index.html:4520` (`pipeCost += 2000`) but the option is hard-coded to `false` at line 4465 and there is **no UI control** to turn it on. Streamlit default is `True` (`ui.py:586`). Impact: the +$2,000/pipe allowance is never applied; relining cost totals are systematically under-quoted vs. the Streamlit tool. Recommended fix: add a `#pkgTrafficControl` checkbox (default checked) wired into `getReliningPackagingOptions`. **Source: `D:\Packaging\scripts\ui.py:585`.** |
| Project initiation multiplier (×1.15) | **BROKEN** | Same pattern as above — code at line 4521 (`pipeCost *= 1.15`), option hard-coded `false` at line 4466, no UI. Streamlit default is `True` (`ui.py:591`). Impact: cost totals are systematically under-quoted by ~15%. Recommended fix: add a `#pkgInitiation` checkbox (default checked). **Source: `D:\Packaging\scripts\ui.py:591`.** |
| Cost mode selector (median / lowest / contractor) | **MISSING (UI)** | Algorithm supports all three modes (lines 4367–4385), but `getReliningPackagingOptions` hard-codes `costMode: 'median'` and `contractor: null` (lines 4463–4464). No `#pkgCostMode` or contractor dropdown. Impact: cannot generate vendor-specific or lowest-price quotes. Recommended fix: expose the three-way selector + contractor dropdown (mirroring `ui.py:486` and `get_contractors`). **Source: `D:\Packaging\scripts\ui.py:182, 486`.** |
| Reconstruction breakdown columns | **MISSING** | Streamlit emits `_trench_vol`, `_waste_t`, `_exc_cost`, `_bkf_cost`, `_dem_cost`, `_waste_cost`, `_pipe_cost_only` per pipe and renames them to readable headers in REC zip output (`ui.py:262–273`). Web tool has no equivalent. **Source: `D:\Packaging\scripts\ui.py:631–636, 262`.** |

---

## 3. Package generation

| Item | Status | Notes |
|---|---|---|
| Count-based packaging | PRESENT (relining only) | `splitReliningItemsByCount` line 4825 |
| Value-based packaging | PRESENT (relining only) | `splitReliningItemsByValue` line 4990 → wraps `splitIntoValuePackagesTwoPass` |
| Two-pass value packaging | PRESENT (relining only) | `splitIntoValuePackagesTwoPass` line 4880; full parity with `cost_engine.py:758` (`split_into_value_packages_twop`) including resolved-groups pass and adjacent-fill |
| Package numbering rules | PRESENT | `RLN_001`, zero-padded width 3, sequential per suburb-alphabetical order (line 4982) |
| RLN_ prefix | PRESENT | Hard-coded throughout |
| REC_ prefix | **MISSING** | No reconstruction packaging path exists. **Source: `D:\Packaging\scripts\ui.py:1189`.** |
| AMP_ prefix | **MISSING** | No amplification packaging path exists. **Source: `D:\Packaging\scripts\ui.py:1203`.** |
| Highest-priority package naming (RLN_001 = highest priority) | PRESENT | `prioritiseAndRenumberReliningPackages` (line 5228) sorts by `package_priority_score` and renumbers from 001 |
| Suburb grouping | PRESENT | `groupReliningItemsForPackaging` line 4875; controlled by `#pkgGroupSuburb` |
| Diameter grouping | PRESENT | `getReliningDiamSizeKey` line 4585; size-group-1..4 inputs render at lines 944–977 |
| Four selectable pipe-size grouping boxes | PRESENT | Groups 1–4 multi-select pills in HTML (lines 944–977); `reliningSizeGroups = [[], [], [], []]` (line 1577); ordered priority logic (line 4891–4904) |
| Compatible diameter rules | PRESENT | `DIAMETER_COMPATIBLE_PAIRS` (line 1566–1575) — exact match to `cost_engine.py:943` (300/375, 375/450, 450/525, 525/600, 600/750, 750/825, 825/900, 900/1050) |
| All sizes ≥1050 mutually compatible | PRESENT | `diametersCompatible` line 4861 returns `true` when both ≥ `DIAMETER_LARGE_THRESHOLD = 1050`, matching `cost_engine.py:960` |

---

## 4. Proximity / clustering

| Item | Status | Notes |
|---|---|---|
| Haversine lat/lon distance | PRESENT | `haversineDistanceM` line 7295 |
| Cluster centre / centroid logic | PRESENT | `meanCoordinate` line 7305; centroid recomputed on each trim pass |
| Radius-based package creation | PRESENT | `assignReliningClusters` (4774) → `buildReliningSpatialCluster` (4727); selectable radius via `#pkgGroupingMethod` (line 930), proxy values 250/500/1000/2000/3000m matching `PROXIMITY_OPTIONS` in `cost_engine.py:67` |
| Centroid-radius trimming | PRESENT | `finaliseReliningCluster` (4704) loops trimming any item past radius and recomputing centroid |
| `enforceReliningPackageRadius` safety sweep | PRESENT | line 5073, called twice in `generateReliningPackages` (after top-up and again after renumber, lines 6157, 6161) |
| Top-up proximity rejection | PRESENT | `topupReliningPackages` line 5118; tentative-add + recompute centroid + reject if `maxDistanceM > options.proximityM` (line 5142) |
| No pipes outside selected radius unless explicitly allowed | PRESENT | Enforced by trimming and final sweep |
| No LGA-wide package grabbing | PRESENT | `groupReliningItemsForPackaging` (line 4875) gates by suburb or `_cluster` only |

This block is the c81e55b proximity fix and is correctly implemented. **Do not modify.**

---

## 5. Top-up logic

| Item | Status | Notes |
|---|---|---|
| Enabled for relining (value packages) | PRESENT | `topupReliningPackages` line 5118; gated by `options.method !== 'count'` (line 5119) |
| Enabled for amplification (value packages) | **MISSING** | No AMP path exists. |
| Disabled for reconstruction | PRESENT-by-omission | (Reconstruction packaging path also doesn't exist.) |
| Same-condition top-up | PRESENT | First top-up pass at `generateReliningPackages` line 6146 over `preview.costed` |
| Same-condition-first then lower-condition pool | PRESENT | Lines 6147–6155 — when mode is `Same condition first, lower condition if needed`, builds a second preview at the *opposite* condition and tops up again |
| Same suburb / compatible diameter constraints | PRESENT | line 5130 (`pkgGroup` check) and 5131 (`pkgSizeGroups.has(getSizeGroup(...))`) |
| Cheapest fitting pipes first | PRESENT | line 5132 sorts ascending by `pipeCost` |
| `topup` flag preserved in outputs | PARTIAL | Flag is set on the in-memory candidate (line 5144 `topup: true`), but the ZIP CSV writer at line 6318 does NOT emit a `topup` column to the per-package CSV. Streamlit ZIP also drops `_`-prefix columns but DOES preserve `topup` (`ui.py:1080`). Impact: end-user can't see which pipes were top-ups in the downloaded CSVs. Recommended fix: add a `topup` column to `HEADERS` (line 6274) and emit it per row. **Source: `D:\Packaging\scripts\cost_engine.py:1070`.** |

---

## 6. Priority logic

| Item | Status | Notes |
|---|---|---|
| `condition_score` uses `asset.condition` | PRESENT | line 5180 (`condition_score = Math.max(Number(asset.condition) || 0, 0)`) |
| Pipe priority calculation | PRESENT | `pipe_priority_score = condition_score * diameter_weight * (1 + criticality_1dp)` (line 5182), matches `cost_engine.py:1142` |
| Package priority calculation | PRESENT | `total_pipe_priority + 5×high_crit + 3×large_diam + 2×worst_condition` (line 5199), matches `cost_engine.py:1160` |
| Package sorting by priority | PRESENT | `reliningPackagePriorityCompare` line 5159 |
| RLN_001 assigned to highest-priority package | PRESENT | `prioritiseAndRenumberReliningPackages` line 5228 |
| Equivalent priority engine for REC / AMP | **MISSING** | (Streams don't exist on the web side.) |

This block is consistent with the c81e55b restoration. **Do not modify.**

---

## 7. Manual editing workflow

| Item | Status | Notes |
|---|---|---|
| Ability to view packages | PRESENT | `renderGeneratedPackages` line 5516, table + map |
| Move assets between packages | **MISSING** | Streamlit has a full Edit Packages subtab — per-pipe `Move to` dropdown, NEW PACKAGE option, renumber, reset (`ui.py:943–1086`). No equivalent in `nbc/index.html`. Impact: users can't redistribute pipes after generation without re-running with different inputs. Recommended fix: port `render_edit_subtab` as a JS panel. **Source: `D:\Packaging\scripts\ui.py:943`.** |
| Recost packages after edits | **MISSING** | Streamlit `render_costing_subtab` (`ui.py:334`) re-costs a selected package on demand with a different cost mode/contractor. Web tool has no recost path. **Source: `D:\Packaging\scripts\ui.py:334`.** |
| Preserve package IDs correctly | PRESENT-by-default | (No editing, so no risk of ID corruption — but also no benefit.) |

---

## 8. ZIP / output generation

| Item | Status | Notes |
|---|---|---|
| JSZip import / setup | PRESENT | `typeof JSZip` guard at `nbc/index.html:6232`; instance at line 6283 |
| Valid ZIP generation | PRESENT | `generateAsync({type:'blob'})` line 6371 |
| Async `zip.generateAsync` handling | PRESENT | line 6371, awaited |
| Blob / download call | PRESENT | lines 6372–6378, anchor click + revokeObjectURL |
| Per-package CSV files | PRESENT | line 6351, one CSV per package |
| `package_summary.txt` | PRESENT | line 6365 — emitted (Streamlit does NOT emit this, so this is a web-tool-only addition) |
| `file_list.txt` | PRESENT | line 6369 — emitted (web-tool-only addition) |
| `package_summary.xlsx` | **MISSING** | Not in current, not in Streamlit, not in monolith. Listed in the audit checklist; treat as a *requested* addition rather than a regression. Recommended fix: optional. |
| `file_list.xlsx` | **MISSING** | Same as above. |
| `relining_packages.zip` | PARTIAL | Zip *content* is correct, but the download filename is `relining_packages_YYYY-MM-DD.zip` (line 6375) not `relining_packages.zip`. `populate_forward_works.py:26` hard-codes `relining_packages.zip` as input. Impact: user must rename before running forward-works pipeline. Recommended fix: drop the date suffix or pass it through a name option. **Source: `D:\Packaging\scripts\populate_forward_works.py:26`.** |
| `reconstruction_packages.zip` | **MISSING** | No REC path. **Source: D:\Packaging.** |
| `amplification_packages.zip` | **MISSING** | No AMP path. **Source: D:\Packaging.** |
| Output filename matching old examples | PARTIAL | Current emits `RLN_001_DEEWHY_BROOKVALE_D375mm.csv` (line 6271 `${pkg.package_id}_${suburbs}_D${dominant}mm.csv`). Old example: `RLN_001_Suburb_D375.csv` — note: (a) current uses **all** suburbs joined with `_`, old used a single suburb; (b) current appends a literal `mm` suffix that the old/Streamlit name does not. For REC/AMP single-pipe packages the old format also inserted the asset id (`REC_005_123456_Suburb_D450.csv`) — not applicable here as REC/AMP don't exist. Impact: cosmetic; downstream regex in `populate_forward_works.py:39` (`r'.*RLN_\d+.*\.csv'`) still matches. Recommended fix optional: drop `mm` and use only the primary suburb. **Source: `D:\Packaging\scripts\ui.py:243–254`.** |
| Totals row | PRESENT | line 6347 (`csvRow(totalsRow)`); pads `Spatial Length_m`, `pipe_cost`, `Diameters (mm)`, `Max Distance Between Pipes (km)`, `Number of Pipes` |
| Currency formatting | PRESENT | `fmtCurrency` line 6238 emits `$#,##0.00` |
| Internal `_` columns removed from non-reconstruction outputs | PRESENT-by-default | Current output never *adds* `_`-prefixed columns (no REC breakdown), so nothing needs filtering. Streamlit explicitly drops them (`ui.py:276`). |
| Reconstruction readable breakdown headers | **MISSING** | Streamlit renames `_trench_vol → Trench Volume (m3)` etc. (`ui.py:262–273`). Not applicable to current since REC doesn't exist. |
| Output columns matching old tool | PARTIAL | Current `HEADERS` (lines 6274–6281) cover the Streamlit `OUTPUT_KEEP_COLS` (`ui.py:158–179`) for the relining case, with the following deltas: `criticality_1dp`, `diameter_weight`, `condition_score`, `pipe_priority_score` are present in both; current has no `Score` column extras beyond raw; `Number of Pipes` is emitted but only on the totals row (Streamlit emits it as a constant per row at `ui.py:300` then `""` per pipe — same effect). |

---

## 9. Forward works compatibility

`populate_forward_works.py` reads each `RLN_\d+*.csv` from the zip and uses these columns:

| Required by populate_forward_works.py | Emitted by current ZIP? | Line |
|---|---|---|
| `package_id` (with `Totals` filter row) | YES | line 6319, 6341 |
| `Asset Suburb` | YES | line 6333 |
| `Pipe_Start_Address` | YES | line 6332 |
| `Asset` | YES | line 6320 |
| `pipe_cost` ($-formatted, parsed via `[$,]` strip) | YES | line 6331 (`fmtCurrency(cost)`) |

| Item | Status | Notes |
|---|---|---|
| Exported relining ZIP can still be consumed by `populate_forward_works.py` | PRESENT | Column set is intact; one usability gripe — `populate_forward_works.py:26` expects literal `relining_packages.zip` while current emits a date-suffixed name (see §8). |
| `package_id`, suburbs, streets, asset list, total package cost remain compatible | PRESENT | All five fields present and correctly formatted |

---

## 10. UI parity

Inputs that exist on the current page (lines 874–1015):

- `#pkgAssetsFile`, `#pkgRatesFile` — file pickers
- `#pkgReliningMode` — Cond 7 / 8 / 7+8
- `#pkgMethod` — value / count
- `#pkgMaxValue`, `#pkgPipeCount`
- `#pkgGroupSuburb` — yes / no
- `#pkgGroupingMethod` — suburb / 250m / 500m / 1000m / 2000m / 3000m
- `size-group-1..4-select` + `_pills` — four size groups
- `pkgTopupMode` radios — No top up / Same condition only / Same condition first, lower condition if needed
- `#pkgPreviewBtn`, `#pkgGenerateBtn`

| Item | Status | Notes |
|---|---|---|
| All old controls still exist | PARTIAL | All *relining* controls from the monolithic `index.html` are present and richer here. The Streamlit-tool controls below are missing. |
| All current controls work | PRESENT | Each control is wired into `getReliningPackagingOptions` (line 4451) or `renderReliningPackagingReasoning`. |
| No missing buttons | PARTIAL | Missing: cost-mode dropdown (median/lowest/contractor), contractor dropdown, traffic-control checkbox, project-initiation checkbox, reconstruction tab, amplification tab, edit-packages panel. |
| No missing output panels | PARTIAL | Missing: REC results panel, AMP results panel, package-cost subtab, edit-packages subtab. The relining map (`#reliningPackagesMap`, line 6392) is a web-tool addition not present in Streamlit. |
| No renamed labels that break workflows | PRESENT | Internal IDs (`pkgMethod`, `pkgMaxValue`, etc.) are stable; no labels were renamed in a way that would break a saved workflow. |

---

## Do not change these

The following items in current `nbc/index.html` are newer than every reference and represent the c81e55b proximity-fix work plus subsequent web-only additions. Any port from the monolith or D:\Packaging must **not** overwrite them:

- **c81e55b proximity fixes (whole block):** lines 4663–4823, 5073–5099, 5118–5157
- **Haversine distance** — `haversineDistanceM` line 7295 (used only on the web side; Streamlit uses Euclidean MGA-Zone-56 metres via `numpy.linalg.norm`)
- **Centroid-radius trimming** — `finaliseReliningCluster` line 4704 (iterative trim until centroid stabilises)
- **`enforceReliningPackageRadius` safety sweep** — line 5073, called twice (after top-up and after renumber) at lines 6157 and 6161
- **Top-up proximity rejection** — line 5142 (tentative-add then recompute-centroid then reject if past radius)
- **`condition_score` using `asset.condition`** — line 5180
- **Diameter-pair rules and `getSizeGroup`** — lines 1566–1577, 4856–4873
- **Island single-pipe forcing** — `forceIslandSinglePipePackages` line 5247 (Scotland Island carve-out, not in any reference)
- **Per-package map with selection / overlay / leader line** — lines 6392–6675
- **`package_summary.txt` and `file_list.txt`** in the ZIP — lines 6365 and 6369 (web-only enhancement; Streamlit zip doesn't include them)
- **`renderReliningPackagingReasoning`** narrative panel — line 5426 (web-only)
- **Future Works workflow** — `mapReliningPackagesToFutureWorksRows` (5863), `loadFutureWorksFromRelining` (5943), `exportFutureWorksCsv` (5953), `importForwardWorksWorkbook` (5695) — web-only bridge between the tool and the forward-works workbook
- **CCTV packaging stream** — lines 6678–7775 (`buildCctvPackagingPreview`, `buildCctvPackagesPortable`, `consolidateSmallCctvPackages`, etc.) — web-only
- **Branding / logo / hub home / Stormgauge launcher routing** (the `36befd3 Fix NBC home splash default view`, `1051f39 Fix Stormgauge deployment source`, `d0244fa Fix RainViewer radar zoom fallback` lineage) — preserve as-is

---

## Recommended fix priority

If/when the user authorises edits, the highest-impact fixes (in order) are:

1. **Wire traffic-control and project-initiation toggles into the UI** (§2). Currently the *cost code path is dead* — every relining package is silently under-quoted. This is a 4-line UI change plus reading two checkboxes in `getReliningPackagingOptions` (line 4451).
2. **Expose cost-mode and contractor selectors** (§2). Same shape — algorithm already supports it; only the input + option wiring is missing.
3. **Drop the date suffix from the ZIP filename** (§8) so the file drops straight into `populate_forward_works.py`.
4. **Add a `topup` column to the per-package CSVs** (§5).
5. **Reconstruction & amplification streams** — large port from `D:\Packaging\scripts\cost_engine.py` and `ui.py`, only worth doing if there's a real need to retire the Streamlit tool.
6. **Edit Packages panel** — large port from `ui.py:943`, only if interactive redistribution is wanted on the web.
