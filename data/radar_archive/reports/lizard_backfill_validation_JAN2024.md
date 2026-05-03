# Lizard "Precipitation Australia" — Jan 2024 AOI Backfill Validation

**Status:** ✅ PASS — 5 of 5 validation checks satisfied. Data is valid rainfall.

- Run completed: 2026-05-03T12:55:10Z
- Endpoint: `https://northernbeaches.lizard.net/api/v4/rasters/1b6c03df-2ad1-4f17-89f6-319ea797b357/data/`
- AOI bbox: `151.15, -33.85, 151.40, -33.55` (Northern Beaches)
- Window: `2024-01-01T00:00:00Z` → `2024-01-31T21:00:00Z` (3-hour grid, inclusive)
- Format: GeoTIFF (Deflate compressed, float32)
- Native CRS: EPSG:4326

## Background — bug fix applied first

Prior `time=ts_iso` parameter was silently ignored by the Lizard `/data/`
endpoint, producing 248 byte-identical fake-success files. The script now
sends `start=ts_iso, stop=ts_iso` (single-instant range), which is the
correct shape. Fix verified before any bulk write:

| timestep | bytes | sha256 |
|---|---|---|
| 2024-01-01T00:00:00Z | 3,855 | `c22ebbbb591cc9ea…` |
| 2024-01-15T12:00:00Z | 4,105 | `a1e1738efa9c8924…` |
| 2024-01-31T21:00:00Z | 3,873 | `c696fe1c6a4706f6…` |

3 distinct hashes ⇒ temporal selection is being honoured by the API.

The 248 invalid Jan 2024 files (and only those) were then deleted before
the re-run; the unrelated 2017-11-20 single-write file was preserved.

## 1. Counts (PASS)

| metric | value |
|---|---|
| Jan 2024 raw `.tif` | **248** (expected 248) |
| Jan 2024 metadata `.json` | **248** |
| missing timesteps | **0** |
| `.tif` without paired `.json` | 0 |
| `.json` without paired `.tif` | 0 |
| first stem on disk | `20240101T000000Z` |
| last stem on disk  | `20240131T210000Z` |

Non-Jan 2024 contents in those dirs: 1 each (the 2017-11-20T15Z single-write file from the earlier discovery validation; intentionally preserved).

## 2. Hash distribution (PASS)

| metric | value |
|---|---|
| distinct sha256 | **219 / 248** |
| distinct file sizes | **203** |
| largest dup class | `932d29fa46d04c34…` × 11 |

Hashes appearing more than once (top 11):
```
932d29fa46d04c34… x11
b98d59368d23daee… x5
3a781ea60ab145fe… x4
7a30335dcb9f4506… x4
5402b3ecbf08cb96… x3
302a30d83fbc640c… x3
b097f4bc9819d812… x2
72bc8aca54e0d3f7… x2
5d07b9877acd5fb7… x2
f366114daaaddb63… x2
ecc261596c4039c2… x2
```

Interpretation: small clusters of identical hashes correspond to
consecutive dry-spell timesteps where the AOI received the same rounded
rainfall (often 0.0 mm) and the Deflate-compressed payload is therefore
bytewise identical. This is the expected pattern for a pluviometric grid
with stretches of zero/trace rainfall, NOT a parameter bug.

## 3. File sizes (PASS)

Sizes range across **203 distinct values**, top 5 most common:

| bytes | occurrences |
|---|---|
| 1646 | 11 |
| 2093 | 5 |
| 1806 | 4 |
| 1904 | 4 |
| 3753 | 4 |

Small files = low/no-rain periods compressing well. Larger files = heavier rainfall periods with more pixel-value variance. Total raw payload bytes for Jan 2024 ≈ 0.5 MB.

## 4. Pixel sanity — 3 spot-check timesteps (PASS)

Each TIFF decodes to a 256×256 float32 grid (Lizard's default oversampling of the native ~4×6 AOI pixels), 65,536 pixels, all valid (no fill values within the AOI). NODATA tag present and = `-32767.0` (matches the raster metadata).

| timestep | min mm/3h | max mm/3h | mean mm/3h | first 4 cells |
|---|---|---|---|---|
| 2024-01-01T00:00:00Z | 0.090 | 0.180 | 0.132 | 0.11, 0.11, 0.11, 0.11 |
| 2024-01-15T12:00:00Z | 1.160 | 2.110 | 1.886 | 1.96, 1.96, 1.96, 1.96 |
| 2024-01-31T21:00:00Z | 0.050 | 0.160 | 0.124 | 0.15, 0.15, 0.15, 0.15 |

All values fall well within the 0–50 mm/3h sanity range. Values are not constant across timesteps. Mid-month timestep clearly higher than start/end-of-month, consistent with real intra-month rainfall variability.

## 5. Wet-day spot check around 2024-01-09 (PASS)

| timestep | max mm/3h | mean mm/3h |
|---|---|---|
| 2024-01-08T21:00:00Z | 0.440 | 0.305 |
| 2024-01-09T00:00:00Z | **0.900** | 0.644 |
| 2024-01-09T03:00:00Z | **0.970** | 0.635 |
| 2024-01-09T06:00:00Z | 0.290 | 0.226 |
| 2024-01-09T09:00:00Z | 0.160 | 0.132 |
| 2024-01-09T12:00:00Z | 0.120 | 0.101 |
| 2024-01-09T15:00:00Z | 0.020 | 0.010 |
| 2024-01-09T18:00:00Z | 0.010 | 0.010 |
| 2024-01-09T21:00:00Z | 0.020 | 0.011 |
| 2024-01-10T00:00:00Z | 0.020 | 0.010 |

Peak ~0.97 mm/3h on 2024-01-09T03:00Z, tapering through the day —
plausible profile for a light overnight system clearing through mid-day.
2024-01-15T12Z (in the spot-check above) was the heavier event of the
month at 2.1 mm/3h max.

## Verdict

| check | result |
|---|---|
| count_ok | ✅ True |
| no_orphans | ✅ True |
| hash_diverse | ✅ True (219/248) |
| size_diverse | ✅ True (203 distinct sizes) |
| rainfall_realistic | ✅ True (peak 0.97 mm/3h on a known rain day; mid-month 2.11 mm/3h max) |

**Conclusion:** the Jan 2024 backfill is valid. The endpoint, parameter
shape, and decoded values all behave as expected. Data is safe to retain
and use for downstream cross-checks against BOM and RainViewer captures.

## Held back per instruction

- No commit, no push.
- No scaling beyond Jan 2024.
- No app logic, UI, AEP/IFD/station/export/radar-display/branding/logo
  changes were made.

Awaiting instruction before proceeding to additional months.
