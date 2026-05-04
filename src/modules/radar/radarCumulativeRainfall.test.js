// Tests for radarCumulativeRainfall.js
//
// Run with:  node --test src/modules/radar/radarCumulativeRainfall.test.js
//
// Integration tests against the real on-disk Lizard archive.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AOI_BBOX,
  NODATA_VALUE,
  parseLizardGeoTiff,
  sampleAtLonLat,
  getRainfallTimeSeriesAtPoint,
  getCumulativeRainfallAtPoint,
  getRainfallComputationSummary,
  getCumulativeRainfallForPolygon,
  clearRadarRasterCache
} from './radarCumulativeRainfall.js';

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVE_ROOT = path.resolve(HERE, '..', '..', '..',
  'data', 'radar_archive', 'processed', 'lizard_precipitation_australia');

// Centre-of-AOI sample point.
const AOI_CENTER = { lon: 151.275, lat: -33.70 };

// =========================================================================
// Reader smoke (the rest depends on this)
// =========================================================================

test('parseLizardGeoTiff: decodes 256x256 Float32 raster from a known wet frame', () => {
  // 2025-07-01T00Z is the peak frame in 2025-07 (max ~14.90 mm spot, per
  // the validated backfill report).
  const tif = path.join(ARCHIVE_ROOT, 'raw_payloads', '20250701T000000Z_lizard_precipitation_australia.tif');
  const raster = parseLizardGeoTiff(readFileSync(tif));
  assert.equal(raster.width, 256);
  assert.equal(raster.height, 256);
  assert.equal(raster.nodata, NODATA_VALUE);
  assert.equal(raster.bbox.minLon, AOI_BBOX.minLon);
  assert.equal(raster.bbox.maxLat, AOI_BBOX.maxLat);
  assert.ok(Math.abs(raster.bbox.maxLon - AOI_BBOX.maxLon) < 1e-9);
  assert.ok(Math.abs(raster.bbox.minLat - AOI_BBOX.minLat) < 1e-9);

  let n = 0, max = -Infinity;
  for (let i = 0; i < raster.values.length; i++) {
    if (raster.values[i] === NODATA_VALUE) continue;
    n++;
    if (raster.values[i] > max) max = raster.values[i];
  }
  assert.equal(n, 256 * 256, 'all pixels valid for this frame');
  assert.ok(Math.abs(max - 14.90) < 0.01, `max should be ~14.90; got ${max}`);
});

test('sampleAtLonLat: returns numeric rainfall at AOI centre for the wet frame', () => {
  const tif = path.join(ARCHIVE_ROOT, 'raw_payloads', '20250701T000000Z_lizard_precipitation_australia.tif');
  const raster = parseLizardGeoTiff(readFileSync(tif));
  const v = sampleAtLonLat(raster, AOI_CENTER.lon, AOI_CENTER.lat);
  assert.ok(Number.isFinite(v), `expected finite numeric rainfall; got ${v}`);
  assert.ok(v > 11 && v < 16, `expected ~13mm at AOI centre on this frame; got ${v}`);
});

// =========================================================================
// Spec scenarios
// =========================================================================

test('available period: cumulative is positive and 100% complete', () => {
  // 2025-07-01 00:00 .. 21:00 — the wet day at the start of July 2025.
  const summary = getRainfallComputationSummary({
    lon: AOI_CENTER.lon, lat: AOI_CENTER.lat,
    startIso: '2025-07-01T00:00:00Z', endIso: '2025-07-01T21:00:00Z'
  });
  assert.equal(summary.expectedSteps, 8);
  assert.equal(summary.contributingSteps, 8, 'all 8 frames must be data-bearing');
  assert.equal(summary.coverageRatio, 1);
  assert.equal(summary.isComplete, true);
  assert.deepEqual(summary.warnings, []);
  assert.ok(Number.isFinite(summary.totalMm));
  assert.ok(summary.totalMm > 0, `expected positive cumulative rainfall; got ${summary.totalMm}`);
});

test('2024-09 offline period: NEVER returns rainfall as zero', () => {
  const summary = getRainfallComputationSummary({
    lon: AOI_CENTER.lon, lat: AOI_CENTER.lat,
    startIso: '2024-09-15T00:00:00Z', endIso: '2024-09-15T21:00:00Z'
  });
  assert.equal(summary.expectedSteps, 8);
  assert.equal(summary.contributingSteps, 0);
  assert.equal(summary.excludedSteps.offline, 8,
    'every frame inside the offline window must be classified as offline');
  assert.equal(summary.totalMm, null,
    'totalMm must be null (NEVER 0) when no frame contributed');
  assert.equal(summary.coverageRatio, 0);
  assert.equal(summary.isComplete, false);
  assert.ok(summary.warnings.some((w) => /offline/.test(w)));
});

test('2020 coverage gap: NEVER returns rainfall as zero', () => {
  const summary = getRainfallComputationSummary({
    lon: AOI_CENTER.lon, lat: AOI_CENTER.lat,
    startIso: '2020-06-15T00:00:00Z', endIso: '2020-06-15T21:00:00Z'
  });
  assert.equal(summary.expectedSteps, 8);
  assert.equal(summary.contributingSteps, 0);
  assert.equal(summary.excludedSteps.coverage_gap, 8);
  assert.equal(summary.totalMm, null);
  assert.equal(summary.coverageRatio, 0);
  assert.equal(summary.isComplete, false);
  assert.ok(summary.warnings.some((w) => /coverage gap/i.test(w)));
});

test('boundary split: range straddles the offline boundary, partial contribution', () => {
  // 2024-08-31T18Z .. 2024-09-01T15Z spans from a sentinel-tail (still in
  // August, all frames are sentinel/missing per the archive) into the
  // offline-classified period. Expect a clean split between
  // sentinel_or_missing and offline counts, with totalMm null.
  const summary = getRainfallComputationSummary({
    lon: AOI_CENTER.lon, lat: AOI_CENTER.lat,
    startIso: '2024-08-31T18:00:00Z', endIso: '2024-09-01T15:00:00Z'
  });
  assert.equal(summary.expectedSteps, 8);
  assert.equal(summary.contributingSteps, 0);
  assert.ok(summary.excludedSteps.offline > 0,        'expected offline-side exclusions');
  assert.ok(summary.excludedSteps.sentinel_or_missing > 0, 'expected sentinel/missing-side exclusions');
  assert.equal(
    summary.excludedSteps.offline + summary.excludedSteps.sentinel_or_missing,
    summary.expectedSteps
  );
  assert.equal(summary.totalMm, null);

  // And a true straddle that mixes data + offline:
  // 2024-08-14T09Z (data) .. 2024-08-14T15Z (sentinel start) crosses the
  // last data-bearing frame before the radar source went silent. The window
  // 2024-08-14T03Z .. 2024-08-14T15Z gives both data and sentinel frames.
  const cum = getCumulativeRainfallAtPoint({
    lon: AOI_CENTER.lon, lat: AOI_CENTER.lat,
    startIso: '2024-08-14T03:00:00Z', endIso: '2024-08-14T15:00:00Z'
  });
  assert.ok(cum.contributingSteps > 0,                 'expected at least one contributing frame');
  assert.ok(cum.excludedSteps.sentinel_or_missing > 0, 'expected at least one sentinel/missing frame');
  assert.ok(Number.isFinite(cum.totalMm) || cum.totalMm === null);
});

test('sentinel exclusion: sentinel-classified frames count as missing, not zero', () => {
  // 2024-11-01 .. 2024-11-19 — radarAvailability says "available" (post-offline)
  // but the archive carries sentinel frames there. They MUST be excluded as
  // sentinel_or_missing, not silently treated as zero rainfall.
  const summary = getRainfallComputationSummary({
    lon: AOI_CENTER.lon, lat: AOI_CENTER.lat,
    startIso: '2024-11-01T00:00:00Z', endIso: '2024-11-19T21:00:00Z'
  });
  assert.equal(summary.contributingSteps, 0);
  assert.ok(summary.excludedSteps.sentinel_or_missing > 0);
  assert.equal(summary.excludedSteps.offline, 0,
    'this window is post-offline by radarAvailability');
  assert.equal(summary.totalMm, null);
  assert.ok(summary.warnings.some((w) => /sentinel/.test(w)));
});

test('point rainfall smoke test: time series matches reader sample at AOI centre', () => {
  const series = getRainfallTimeSeriesAtPoint({
    lon: AOI_CENTER.lon, lat: AOI_CENTER.lat,
    startIso: '2025-07-01T00:00:00Z', endIso: '2025-07-01T00:00:00Z'
  });
  assert.equal(series.length, 1);
  assert.equal(series[0].ts, '2025-07-01T00:00:00Z');
  assert.equal(series[0].status, 'data');
  assert.ok(series[0].valueMm > 11 && series[0].valueMm < 16,
    `expected ~13mm at AOI centre; got ${series[0].valueMm}`);
});

test('out-of-bounds point: throws clear RangeError', () => {
  assert.throws(
    () => getCumulativeRainfallAtPoint({
      lon: 152.0, lat: -34.0,  // well outside the AOI
      startIso: '2025-07-01T00:00:00Z', endIso: '2025-07-01T03:00:00Z'
    }),
    /outside the radar AOI/
  );
});

test('invalid inputs: each bad input produces a typed error', () => {
  assert.throws(
    () => getCumulativeRainfallAtPoint({
      lon: 'not a number', lat: AOI_CENTER.lat,
      startIso: '2025-07-01T00:00:00Z', endIso: '2025-07-01T03:00:00Z'
    }),
    TypeError
  );
  assert.throws(
    () => getCumulativeRainfallAtPoint({
      lon: AOI_CENTER.lon, lat: AOI_CENTER.lat,
      startIso: 'not-a-date', endIso: '2025-07-01T03:00:00Z'
    }),
    TypeError
  );
  assert.throws(
    () => getCumulativeRainfallAtPoint({
      lon: AOI_CENTER.lon, lat: AOI_CENTER.lat,
      startIso: '2025-07-01T03:00:00Z', endIso: '2025-07-01T00:00:00Z'
    }),
    RangeError
  );
  assert.throws(
    () => getCumulativeRainfallForPolygon({
      polygon: [[151.2, -33.7]],   // <3 vertices
      startIso: '2025-07-01T00:00:00Z', endIso: '2025-07-01T03:00:00Z'
    }),
    TypeError
  );
});

// =========================================================================
// Polygon coverage smoke
// =========================================================================

test('getCumulativeRainfallForPolygon: clean window returns positive area-mean', () => {
  const polygon = [
    [151.20, -33.65],
    [151.30, -33.65],
    [151.30, -33.75],
    [151.20, -33.75]
  ];
  const result = getCumulativeRainfallForPolygon({
    polygon,
    startIso: '2025-07-01T00:00:00Z', endIso: '2025-07-01T21:00:00Z'
  });
  assert.equal(result.expectedSteps, 8);
  assert.equal(result.contributingSteps, 8);
  assert.ok(result.pixelCount > 0, 'polygon should cover at least one pixel');
  assert.ok(Number.isFinite(result.meanMm) && result.meanMm > 0,
    `expected positive area-mean; got ${result.meanMm}`);
});

test('getCumulativeRainfallForPolygon: returns null mean when only offline frames are in range', () => {
  const polygon = [
    [151.20, -33.65],
    [151.30, -33.65],
    [151.30, -33.75],
    [151.20, -33.75]
  ];
  const result = getCumulativeRainfallForPolygon({
    polygon,
    startIso: '2024-09-15T00:00:00Z', endIso: '2024-09-15T21:00:00Z'
  });
  assert.equal(result.contributingSteps, 0);
  assert.equal(result.meanMm, null);
  assert.equal(result.excludedSteps.offline, 8);
});

test('cache: clearRadarRasterCache forces re-read without changing results', () => {
  const opts = {
    lon: AOI_CENTER.lon, lat: AOI_CENTER.lat,
    startIso: '2025-07-01T00:00:00Z', endIso: '2025-07-01T03:00:00Z'
  };
  const a = getCumulativeRainfallAtPoint(opts);
  clearRadarRasterCache();
  const b = getCumulativeRainfallAtPoint(opts);
  assert.deepEqual(a, b);
});
