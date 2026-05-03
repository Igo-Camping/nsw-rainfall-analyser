# Pre-Split Cleanup Manifest — Pluviometrics / Stormgauge

Mode: PLANNING ONLY. No file in the working tree has been modified, staged, committed, or removed by this session. The only file written is this manifest.

---

## 1. Executive summary

This manifest catalogues every loose, duplicate, untracked, or case-clashing path in the Pluviometrics / Stormgauge repo so that a single confirmed cleanup pass can land BEFORE the `index.html` split begins. Doing the cleanup first means the snapshots that the split will produce won't immediately drift against five copies of the same JSON, four copies of `index.html`, and a case-variant logo folder.

**Path note for the user**: there is no top-level directory called `pluvio-stormgauge-staging`. The local clone of `Igo-Camping/pluvio-stormgauge` (branch `staging`) IS `C:\Users\fonzi\Weather App Folder` itself. The string `pluvio-stormgauge-staging` only appears as one of six untracked sub-shells under `_staging_rebuild/` (a polyrepo-split scratch area with no `.git`, see Section 5). All findings below relate to the actual clone at `C:\Users\fonzi\Weather App Folder`.

**Key risks driving urgency** (from the audit report):
- `Assets/Logos/` and `assets/logos/` are BOTH tracked by git (4 distinct blobs across the two cases). On Windows NTFS they collapse to one physical folder; on a Linux Pages build they will split and one set will appear missing.
- 8 hash-duplicate file groups between `data/` and `Superseeded/` (and between root JS blobs and `Superseeded/`), totalling ~40 MB of pure duplication.
- Three legacy root `index*.html` siblings, two of which are tracked; none are referenced by anything.
- 7 untracked, substantive scripts (`scripts/lizard_*.py`, `scripts/radar_*.py`, two launchers) sitting in version-control limbo.

---

## 2. Current git state

| Item | Value |
|---|---|
| Branch | `staging` |
| HEAD commit | `0f0ffec70fb59ad2dc2a863981463f67ebe6670f` ("Move Pluviometrics email signature logo to lowercase asset path") |
| `core.ignorecase` | `true` (Windows NTFS) |
| Tracked files (`git ls-files`) | 48 |
| Untracked entries (`git status --short`) | 16 (was 15 before this session created `reports/`) |
| Working tree dirty? | Yes — was already dirty before this session. No staged changes; only untracked entries. |
| Nested `.git` directories detected | `nbc/.git` (remote `Igo-Camping/nbc`, branch `main`); `nbc-rainfall-tool-standalone/.git` (same remote `Igo-Camping/nbc`, branch `main`) |

---

## 3. Cleanup candidates grouped

### A. Safe tracked duplicates to remove from repo
- `Superseeded/bom_ifd_cache.js` (hash-identical to live root copy, 13.93 MB)
- `Superseeded/bom_northern_beaches_all_gauges.js` (hash-identical, 7.34 MB)
- `Superseeded/nsw_lga_boundaries.js` (hash-identical, 1.36 MB)
- `Superseeded/pluviometrics_ifd_cache.json` (hash-identical to `data/`, 4.98 MB)
- `Superseeded/pluviometrics_ifd_table.json` (hash-identical to `data/`, 6.44 MB)
- `Superseeded/pluviometrics_ifd_errors.json` (hash-identical to `data/`, 419 B)
- `Superseeded/pluviometrics_rainfall_stations.json` (hash-identical to `data/`, 587 KB)
- `Superseeded/pluviometrics_stations.json` (hash-identical to `data/`, 4 KB)
- `index_backup.html` (tracked; never referenced; recovery snapshot)
- `index_backup_1.html` (tracked; never referenced; recovery snapshot)

### B. Safe untracked clutter to ignore or remove
- `.tmp_zipbundle.txt`, `.tmp_zipfunc.txt` (scratch from a zip-helper script)
- `.claude/` (Claude Code per-project config; should not be in shared repo)
- `data/_backup/` (ad-hoc 2026-05-02 backup)
- `data/radar_archive/` (regenerable runtime archive — but see "needs review" below; deletion would discard captured radar tiles)
- `_staging_rebuild/` (untracked polyrepo-split scratch; see Section 5)
- `Superseeded/snapshot-20260430-082224/` (dated snapshot; entirely untracked already)
- `bom-refresh.{out,err}.log`, `pluvio-atmos-server.{out,err}.log` (already covered by `*.log` ignore — currently shown clean by status, listed for completeness)
- `New folder/` (empty — Windows Explorer artefact, not in untracked list because it is empty)
- `reports/` (this report's parent dir; safe to leave untracked or commit at user's choice)

### C. Must keep
- `index.html`, `styles.css`, `CNAME`, `.nojekyll`, `.gitignore`, `.gitattributes`, `.python-version`
- Root data blobs `bom_ifd_cache.js`, `bom_northern_beaches_all_gauges.js`, `nsw_lga_boundaries.js` (loaded by `index.html` lines 19-21 — see audit)
- `Assets/Logos/{ATMOS,PLUVIOMETRICS,STORMGAUGE}.png` (referenced by `index.html` lines 269, 291)
- `assets/logos/pluviometrics-main.png` (email-signature asset; commit `0f0ffec` is its sole purpose)
- Everything under `src/modules/`, `templates/`, `data/pluviometrics_ifd_table.json`, `scripts/enrich_ifd.py`
- `Superseeded/before-blank-screen-fix-20260430/index.html`, `Superseeded/direct-calculator-route-before-fix/{index.html,controls.js}`, `Superseeded/index.html` (labelled snapshots — keep as historical reference even though not byte-unique to the live tree)

### D. Needs manual review
- The 7 untracked `scripts/lizard_*.py`, `scripts/radar_*.py`, `scripts/run_radar_capture.bat`, `scripts/create_pluviometrics_storage_structure.ps1` — substantive radar / Lizard tooling. Per the inviolable rules, NEVER deletion-candidates. Decision required: commit, move to `scripts/experimental/`, or formally `.gitignore`.
- `data/radar_archive/` — this is a populated radar capture pipeline output. Easy to regenerate via `scripts/radar_capture.py` from BOM/RainViewer if those endpoints serve historical frames; potentially impossible to regenerate if it accumulated frames over time. Decision: snapshot to backup before any ignore/delete.
- `nbc/` and `nbc-rainfall-tool-standalone/` — full nested clones of `Igo-Camping/nbc`. Already in `.gitignore`. Owner decision: leave in working tree (current state) or move outside this clone.
- `Superseeded/direct-calculator-route-before-fix/index.html` is byte-identical to the live `index.html` (audit C1). Either rename the snapshot folder to reflect that the actual fix lives in `src/modules/ui/controls.js:79-81`, or leave the misleading label and add a README. Out of scope for this cleanup but flagging.

### E. Do not touch
- AEP / IFD / station / export / radar / BOM / RainViewer / routing / splash code (all of `src/modules/`, all AEP/IFD blocks of `index.html`, all radar capture scripts beyond their tracking decision)
- Any logo or branding asset content (rename of folder case is allowed; image bytes are off-limits)
- `nbc/` and `nbc-rainfall-tool-standalone/` interior contents (foreign repos)
- `templates/NBC Rainfall Calculator.xlsm` (per CLAUDE.md, do not modify unless asked)

---

## 4. Action table

State key: T = tracked; U = untracked; T+U = case-clash present in both git index and untracked working tree.

| Path | State | Type | Evidence | Proposed action | Risk | Requires confirmation |
|---|---|---|---|---|---|---|
| `Superseeded/bom_ifd_cache.js` | T | Duplicate JS data blob | Audit C2: SHA-256 `30D7A3EFACDA`, identical to root `bom_ifd_cache.js` (13,929,665 B) | `git rm` | Low — exact dupe, snapshot folders already preserve point-in-time copies | Yes |
| `Superseeded/bom_northern_beaches_all_gauges.js` | T | Duplicate JS data blob | Audit C3: SHA-256 `C8C6EAD9BEFE`, identical to root copy (7,341,795 B) | `git rm` | Low | Yes |
| `Superseeded/nsw_lga_boundaries.js` | T | Duplicate JS data blob | Audit C4: SHA-256 `121E713E7283`, identical to root (1,362,032 B) | `git rm` | Low | Yes |
| `Superseeded/pluviometrics_ifd_cache.json` | T | Duplicate JSON | Audit C6: SHA-256 `71E5E96E73C3`, identical to `data/` (4,980,348 B) | `git rm` | Low | Yes |
| `Superseeded/pluviometrics_ifd_table.json` | T | Duplicate JSON | Audit C5: SHA-256 `27F55D2B4B7C`, identical to `data/` (6,444,969 B) | `git rm` | Low | Yes |
| `Superseeded/pluviometrics_ifd_errors.json` | T | Duplicate JSON | Audit footnote: SHA-256 `ACE10A2C9CA9`, identical to `data/` (419 B) | `git rm` | Low | Yes |
| `Superseeded/pluviometrics_rainfall_stations.json` | T | Duplicate JSON | Audit C7: SHA-256 `4A83F4456980`, identical to `data/` (586,588 B) | `git rm` | Low | Yes |
| `Superseeded/pluviometrics_stations.json` | T | Duplicate JSON | Audit C8: SHA-256 `43DF60E38B99`, identical to `data/` (4,045 B) | `git rm` | Low | Yes |
| `index_backup.html` | T | Legacy index snapshot | 812,120 B / 4,473 lines / SHA-256 `999BD9E13A3B`. Never appears in `git log -- index_backup.html` (no commit history); only snapshotted once by the rebrand. Not referenced by any tracked `*.html`/`*.css`/`*.js`. | `git mv` to `Superseeded/index_backup.html` (recommended) OR `git rm` | Low — not loaded anywhere | Yes |
| `index_backup_1.html` | T | Legacy index snapshot | 821,170 B / 4,673 lines / SHA-256 `7A852A196FF1`. No git history. Not referenced. | `git mv` to `Superseeded/index_backup_1.html` OR `git rm` | Low | Yes |
| `index.before-recovered-lost-work.html` | U (already in `.gitignore`) | Legacy index snapshot | 879,671 B / 5,438 lines / SHA-256 `D29C59D940A1`. Already ignored by `.gitignore` line 3. | Move to `Superseeded/` or `Remove-Item`; either way no git change required | Low | Yes — user choice on physical retention |
| `assets/logos/pluviometrics-main.png` | T | Logo (lowercase folder) | Tracked blob `890e903491970daa19566c68a899382013c9b841`, 1,963,871 B. Sole occupant of lowercase folder. NOT referenced by any tracked `*.html`/`*.css`/`*.js` (grep yielded zero hits). | Leave as-is. Folder name is canonical web style. See Section 5 for `Assets/Logos/` migration recommendation. | Low | No |
| `Assets/Logos/{ATMOS,PLUVIOMETRICS,STORMGAUGE}.png` | T | Logos (capitalised folder) | 3 tracked blobs (sizes 723,079 / 376,222 / 555,258). `STORMGAUGE.png` referenced by `index.html` lines 269, 291. `ATMOS.png` and `PLUVIOMETRICS.png` not referenced in any tracked source file (only present in untracked `_staging_rebuild/` snapshots). | RECOMMEND consolidation under lowercase `assets/logos/` per Section 5. Requires `git mv` of 3 PNGs AND text edits to `index.html` lines 269 & 291. NOT proposed for this cleanup pass — flagged for a dedicated commit because it touches the live HTML. | High if done casually (case-sensitive deploy will break); Low if done in single atomic commit with the index.html edits | Yes |
| `.tmp_zipbundle.txt` | U | Scratch | 3,641 B, 2026-04-30 timestamp; not referenced; matches no current `.gitignore` rule | Add `.tmp_*` to `.gitignore`; physical file can stay or be removed | None | Yes |
| `.tmp_zipfunc.txt` | U | Scratch | 1,014 B, 2026-04-30; same as above | Same as above | None | Yes |
| `.claude/` | U | Claude Code per-project config | Local IDE/agent config; not currently in `.gitignore` | Add `.claude/` to `.gitignore` | None | Yes |
| `_staging_rebuild/` | U | Polyrepo-split scratch dir | 6 sub-shells: `nbc-staging/`, `pluvio-atmos-staging/`, `pluvio-stormgauge-staging/`, `pluviometrics-admin-staging/`, `pluviometrics-core/`, `pluviometrics-hub-staging/`, plus `reports/`, `scripts/`, `tests/`. None contain a `.git` directory. Created 2026-05-02. | Add `_staging_rebuild/` to `.gitignore`. Owner decision separately on whether to initialise as polyrepo or delete. | Medium — risk of losing work if removed before any has been backed up | Yes (do not remove) |
| `data/_backup/` | U | Ad-hoc backup | Audit notes 2026-05-02 snapshot of `data/*.json` | Add `data/_backup/` to `.gitignore`. Physical files: leave alone. | None | Yes |
| `data/radar_archive/` | U | Radar capture output | Audit row: README.md, SCHEMA.md, lizard_inventory/, logs/, metadata/, processed/, raw/, reports/, tiles/. Populated by `scripts/radar_capture.py` and `scripts/radar_archive_manifest.py`. | Add `data/radar_archive/` to `.gitignore`. DO NOT delete (potentially irrecoverable historical frames). | Medium if deleted; None if just gitignored | Yes |
| `Superseeded/snapshot-20260430-082224/` | U | Dated mini-snapshot | 22 files including `index.html`, `scripts/`, `src/modules/...`, `styles.css`. Untracked entirely. | Leave alone OR add `Superseeded/snapshot-*/` ignore rule. Either way, do not delete. | None | Yes |
| `scripts/lizard_inventory.py` | U | Lizard v4 inventory tool | First lines: read-only inventory of Lizard rasters API; no binary fetch. Substantive. | `git add` (commit) — RECOMMENDED. Alt: move to `scripts/experimental/`. NEVER delete. | None if committed | Yes |
| `scripts/lizard_precip_aoi_backfill.py` | U | Lizard "Precipitation Australia" AOI backfill | Read-only/GET-only, paginated, 429-aware backfill into `data/radar_archive/processed/`. | Same as above — `git add` recommended. | None | Yes |
| `scripts/lizard_rastersource_inventory.py` | U | Lizard rastersource metadata fetcher | Stage 2 of inventory: enriches raster records with rastersource backend metadata. | Same — `git add`. | None | Yes |
| `scripts/radar_archive_manifest.py` | U | Manifest builder for `data/radar_archive/raw/` | Builds `metadata/captures.csv`, `captures.jsonl`, `reports/archive_status.md`. Defaults to dry-run. | Same — `git add`. | None | Yes |
| `scripts/radar_capture.py` | U | BOM + RainViewer 5-minute capture into `G:\Pluviometrics` | Idempotent capture; writes raw PNGs and a manifest. Designed for Task Scheduler. | Same — `git add`. | None | Yes |
| `scripts/radar_missing_frames_report.py` | U | Gap report from `captures.csv` | Reads manifest, writes `reports/missing_frames.md`. | Same — `git add`. | None | Yes |
| `scripts/run_radar_capture.bat` | U | Task Scheduler launcher | 6-line wrapper invoking `radar_capture.py`. Hardcodes `C:\Users\fonzi\Weather App Folder` cwd. | Same — `git add`. The hardcoded path is a portability concern but not blocking. | None | Yes |
| `scripts/create_pluviometrics_storage_structure.ps1` | U | One-shot folder bootstrapper for `G:\Pluviometrics` | Idempotent mkdir-only script. Never modifies existing files. | Same — `git add`. | None | Yes |
| `nbc/` | U (gitignored) | Foreign nested clone of `Igo-Camping/nbc` | `.git` present; remote `https://github.com/Igo-Camping/nbc.git`; branch `main` | LEAVE — already gitignored. Owner decision separately whether to relocate outside this clone. | None (cosmetic) | No |
| `nbc-rainfall-tool-standalone/` | U (gitignored) | Foreign nested clone of `Igo-Camping/nbc` (same remote) | `.git` present; remote `https://github.com/Igo-Camping/nbc.git`; branch `main` | LEAVE — already gitignored. | None | No |
| `New folder/` | U (empty) | Empty Explorer artefact | Empty dir; doesn't appear in `git status --short` (untracked-empty are skipped) | Optional `Remove-Item -Force New folder/` outside git | None | No |
| `reports/` (this dir) | U | Audit + this manifest | Created by the audit/manifest sessions | Leave untracked OR commit. Owner decision. | None | No |

---

## 5. Special handling sections

### 5.1 `Assets/Logos/` vs `assets/logos/`

**Git index** (4 distinct blobs across the two case-folders):
```
Assets/Logos/ATMOS.png         blob df756fc8…  723,079 B
Assets/Logos/PLUVIOMETRICS.png blob 037ed670… 376,222 B
Assets/Logos/STORMGAUGE.png    blob dd2ae53a… 555,258 B
assets/logos/pluviometrics-main.png blob 890e9034… 1,963,871 B
```

**Windows NTFS reality** (`core.ignorecase=true`): the two paths collapse to a single physical folder. PowerShell's `Get-ChildItem` on either path returns ALL FOUR files because they live in the same on-disk directory — but the git index still tracks them under different cases. On a case-sensitive deploy (Cloudflare Pages, Netlify, Linux GH-Pages-equivalent) the two paths split.

**References found in tracked source**:
| File | Line | Reference |
|---|---|---|
| `index.html` | 90 | `html[data-theme="dark"] .logo { … }` (CSS class, not a path) |
| `index.html` | 269 | `<img class="logo" src="Assets/Logos/STORMGAUGE.png" alt="Stormgauge">` |
| `index.html` | 291 | `<img class="home-logo" src="Assets/Logos/STORMGAUGE.png" alt="Stormgauge">` |
| `styles.css` | 29 | `.logo{…}` (CSS class) |
| `styles.css` | 201, 220, 233 | `.home-logo{…}` (CSS class) |
| `src/**/*.js` | — | No matches for any logo path |

So only the live `index.html` references the `Assets/Logos/` (capitalised) path. `assets/logos/pluviometrics-main.png` is referenced ONLY by external email-signature usage (not by anything in this repo's served code).

**Recommendation**: Consolidate under lowercase `assets/logos/` (web convention; matches the email-signature asset that already lives there) in a single dedicated commit:
1. `git mv Assets/Logos/{ATMOS,PLUVIOMETRICS,STORMGAUGE}.png assets/logos/`
2. Edit `index.html` lines 269 and 291 to `src="assets/logos/STORMGAUGE.png"` (also matches the audit recommendation).
3. Verify on a case-sensitive build before merging.

This is NOT proposed for the current cleanup pass because the inviolable rules forbid touching live `index.html` text. It is flagged here as a separate dedicated commit.

### 5.2 `Superseeded/` (sic — typo of "Superseded")

Folder name is `Superseeded` (double-e). The correctly-spelled `Superseded/` does not exist at the root of this clone (only inside `nbc/`).

**Tracked entries** (`git ls-files Superseeded/`):
```
Superseeded/before-blank-screen-fix-20260430/index.html
Superseeded/bom_ifd_cache.js
Superseeded/bom_northern_beaches_all_gauges.js
Superseeded/direct-calculator-route-before-fix/controls.js
Superseeded/direct-calculator-route-before-fix/index.html
Superseeded/index.html
Superseeded/nsw_lga_boundaries.js
Superseeded/pluviometrics_ifd_cache.json
Superseeded/pluviometrics_ifd_errors.json
Superseeded/pluviometrics_ifd_table.json
Superseeded/pluviometrics_rainfall_stations.json
Superseeded/pluviometrics_stations.json
```

**Untracked entries** (`git ls-files --others --exclude-standard Superseeded/`): the entire `Superseeded/snapshot-20260430-082224/` tree (22 files including its own `index.html`, `scripts/`, `src/modules/`, `styles.css`).

**Hash-duplicate groups inside `Superseeded/`** (cross-ref audit C2-C8 + footnote):
- C2 `Superseeded/bom_ifd_cache.js` ≡ root `bom_ifd_cache.js` (13.93 MB)
- C3 `Superseeded/bom_northern_beaches_all_gauges.js` ≡ root (7.34 MB)
- C4 `Superseeded/nsw_lga_boundaries.js` ≡ root (1.36 MB)
- C5 `Superseeded/pluviometrics_ifd_table.json` ≡ `data/` copy (6.44 MB)
- C6 `Superseeded/pluviometrics_ifd_cache.json` ≡ `data/` copy (4.98 MB)
- C7 `Superseeded/pluviometrics_rainfall_stations.json` ≡ `data/` copy (587 KB)
- C8 `Superseeded/pluviometrics_stations.json` ≡ `data/` copy (4 KB)
- footnote `Superseeded/pluviometrics_ifd_errors.json` ≡ `data/` copy (419 B)
- C1 `Superseeded/direct-calculator-route-before-fix/index.html` ≡ live `index.html` (822,863 B). The actual fix lives in `src/modules/ui/controls.js:79-81`, so the snapshot label is misleading.

**Recommendation**:
- `git rm` the 8 duplicate JSON / JS data files listed in Section 3A.
- KEEP `Superseeded/index.html`, `Superseeded/before-blank-screen-fix-20260430/index.html`, `Superseeded/direct-calculator-route-before-fix/{index.html,controls.js}` as labelled snapshots.
- LEAVE `Superseeded/snapshot-20260430-082224/` untracked (it's a complete labelled snapshot; either commit it as historical reference or add `Superseeded/snapshot-*/` to `.gitignore`).
- The "Superseeded" -> "Superseded" rename is cosmetic and out of scope.

### 5.3 Root `index_backup*.html` and `index.before-recovered-lost-work.html`

| File | Tracked? | Size (B) | Lines | SHA-256 (first 12) | `git log -- <path>` |
|---|---|---:|---:|---|---|
| `index.html` (live) | T | 822,863 | 5,258 | `31C15C6781E2` | many commits |
| `index_backup.html` | T | 812,120 | 4,473 | `999BD9E13A3B` | (no commits returned) |
| `index_backup_1.html` | T | 821,170 | 4,673 | `7A852A196FF1` | (no commits returned) |
| `index.before-recovered-lost-work.html` | U (gitignored) | 879,671 | 5,438 | `D29C59D940A1` | `a4409f0 Fix radar fallback zoom handling` (incidental match) |

None of the three legacy variants is referenced by any tracked source. All four files share the same outer scaffolding but no two share a hash.

**Recommendation**:
- `git mv index_backup.html Superseeded/index_backup.html` (or `git rm`).
- `git mv index_backup_1.html Superseeded/index_backup_1.html` (or `git rm`).
- `index.before-recovered-lost-work.html` is already gitignored: optional physical move into `Superseeded/` outside git.

### 5.4 Nested clones

| Path | Has `.git`? | Remote URL | Branch | Recommendation |
|---|---|---|---|---|
| `nbc/` | Yes | `https://github.com/Igo-Camping/nbc.git` | `main` | LEAVE in place. Already in `.gitignore`. NEVER delete automatically — owner decides whether to relocate outside this clone. |
| `nbc-rainfall-tool-standalone/` | Yes | `https://github.com/Igo-Camping/nbc.git` (same remote as `nbc/`) | `main` | LEAVE in place. Already in `.gitignore`. NEVER delete automatically. |
| `_staging_rebuild/` | No | — | — | LEAVE in place. Add `_staging_rebuild/` to `.gitignore`. NEVER delete — represents in-progress polyrepo split work. |
| `_staging_rebuild/pluviometrics-admin-staging/` | No | — | — | Leave (covered by parent ignore). |
| `_staging_rebuild/pluvio-stormgauge-staging/` | No | — | — | Leave. NOTE: this is the only on-disk path the user's `pluvio-stormgauge-staging` reference could be matching — it is a content shell, not a git clone. |
| `_staging_rebuild/{nbc-staging,pluvio-atmos-staging,pluviometrics-core,pluviometrics-hub-staging}/` | No | — | — | Leave (covered by parent ignore). |

Both `nbc/` and `nbc-rainfall-tool-standalone/` point at the SAME remote (`Igo-Camping/nbc`) — they are two checkouts of one upstream. That is fine but worth noting; they are not divergent forks.

### 5.5 Untracked radar / lizard scripts

| File | One-line purpose | Recommended action |
|---|---|---|
| `scripts/lizard_inventory.py` | Read-only Lizard v4 raster catalogue walker (writes JSON/CSV under `data/radar_archive/lizard_inventory/`). | Commit (`git add`). |
| `scripts/lizard_precip_aoi_backfill.py` | Read-only AOI-clipped backfill of the Lizard "Precipitation Australia" raster into `data/radar_archive/processed/`. | Commit. |
| `scripts/lizard_rastersource_inventory.py` | Stage-2 metadata enricher reading `rastersource_links.csv` and fetching `/rastersources/<uuid>/`. | Commit. |
| `scripts/radar_archive_manifest.py` | Builds `data/radar_archive/metadata/captures.{csv,jsonl}` + `reports/archive_status.md` from `raw/`. Dry-run by default. | Commit. |
| `scripts/radar_capture.py` | 5-minute BOM + RainViewer capture into `G:\Pluviometrics`; idempotent; designed for Task Scheduler. | Commit. |
| `scripts/radar_missing_frames_report.py` | Reads `captures.csv`, writes `reports/missing_frames.md` listing missing intervals per radar. | Commit. |
| `scripts/run_radar_capture.bat` | 6-line Task Scheduler wrapper for `radar_capture.py`. Hardcoded `C:\Users\fonzi\Weather App Folder` cwd (portability caveat). | Commit. |
| `scripts/create_pluviometrics_storage_structure.ps1` | Idempotent mkdir-only bootstrapper for the `G:\Pluviometrics` directory tree. Never modifies existing files. | Commit. |

Per inviolable rules: NONE of these is a deletion candidate. All are substantive. Default recommendation is to commit each into the existing `scripts/` directory; alternative is `scripts/experimental/`. Either way they should leave version-control limbo.

### 5.6 `.gitignore` coverage gap analysis

Current `.gitignore` already covers: `index.before-recovered-lost-work.html`, `*.log`, `__pycache__/`, packaging-tool artefacts, `data/index.html`, several `data/*.json` files, `data/station-verification/`, `nbc/`, `nbc-rainfall-tool-standalone/`, etc.

Untracked entries NOT yet covered, and the simple rules that would cover them:

| Untracked entry | Suggested `.gitignore` line |
|---|---|
| `.claude/` | `.claude/` |
| `.tmp_zipbundle.txt`, `.tmp_zipfunc.txt` | `.tmp_*` |
| `_staging_rebuild/` | `_staging_rebuild/` |
| `data/_backup/` | `data/_backup/` |
| `data/radar_archive/` | `data/radar_archive/` |
| `Superseeded/snapshot-*/` (only if you decide not to commit it) | `Superseeded/snapshot-*/` |

The 7 untracked `scripts/lizard_*.py`, `scripts/radar_*.py`, etc. are NOT in `.gitignore` — they will keep showing as `??` until either committed or explicitly ignored. This manifest recommends committing them rather than ignoring, so no `.gitignore` change is proposed for those.

---

## 6. Confirmation checklist

I recommend deleting these tracked duplicate files:
- `Superseeded/bom_ifd_cache.js`
- `Superseeded/bom_northern_beaches_all_gauges.js`
- `Superseeded/nsw_lga_boundaries.js`
- `Superseeded/pluviometrics_ifd_cache.json`
- `Superseeded/pluviometrics_ifd_table.json`
- `Superseeded/pluviometrics_ifd_errors.json`
- `Superseeded/pluviometrics_rainfall_stations.json`
- `Superseeded/pluviometrics_stations.json`
- `index_backup.html` (or move to `Superseeded/`)
- `index_backup_1.html` (or move to `Superseeded/`)

I recommend adding these ignore rules:
- `.claude/`
- `.tmp_*`
- `_staging_rebuild/`
- `data/_backup/`
- `data/radar_archive/`
- `Superseeded/snapshot-*/` (only if `Superseeded/snapshot-20260430-082224/` will not be committed)

I recommend leaving these untouched:
- `Assets/Logos/{ATMOS,PLUVIOMETRICS,STORMGAUGE}.png` AND `assets/logos/pluviometrics-main.png` — case-folder consolidation belongs in its own dedicated commit that also edits `index.html` lines 269 and 291; do NOT touch in this cleanup pass.
- `Superseeded/index.html`, `Superseeded/before-blank-screen-fix-20260430/index.html`, `Superseeded/direct-calculator-route-before-fix/{index.html,controls.js}` — labelled historical snapshots.
- `Superseeded/snapshot-20260430-082224/` — keep on disk; commit-or-ignore is a separate decision.
- `nbc/` and `nbc-rainfall-tool-standalone/` — foreign nested clones, already gitignored.
- `_staging_rebuild/` — uncommitted polyrepo-split scratch; ignore but never delete.
- `data/radar_archive/` — populated radar capture output; ignore but never delete.
- All 7 untracked `scripts/lizard_*.py`, `scripts/radar_*.py`, `scripts/run_radar_capture.bat`, `scripts/create_pluviometrics_storage_structure.ps1` — recommend committing as-is rather than ignoring; under no circumstances delete.
- AEP / IFD / station / export / radar / BOM / RainViewer / routing / splash code in `index.html` and `src/modules/`.

Waiting for user confirmation before cleanup.
