// Tests for radarArchiveIndex.js
//
// Run with:  node --test src/modules/radar/radarArchiveIndex.test.js
//
// Uses node:test + node:assert (no third-party dependencies). Reads the
// real on-disk archive — these are integration tests, not unit tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRadarArchiveIndex,
  detectRadarGaps,
  getArchiveCoverageForRange,
  getUsableTimesteps,
  validateArchiveIntegrity,
  getDataBearingTimestamps,
  clearRadarArchiveIndexCache,
  __internal
} from './radarArchiveIndex.js';

// Build once — every test reuses the cached index.
const index = buildRadarArchiveIndex();

test('buildRadarArchiveIndex: timestamps are sorted and unique', () => {
  const ts = index.timestamps;
  assert.ok(ts.length > 0, 'expected non-empty timestamp list');
  for (let i = 1; i < ts.length; i++) {
    assert.ok(ts[i - 1] < ts[i], `timestamps must be strictly ascending at index ${i}`);
  }
  assert.equal(new Set(ts).size, ts.length, 'timestamps must be unique');
});

test('buildRadarArchiveIndex: first/last and inferred 3h timestep', () => {
  assert.equal(index.firstTimestamp, '2017-11-20T15:00:00Z');
  assert.equal(index.lastTimestamp,  '2026-05-10T12:00:00Z');
  assert.equal(index.timestepHours, 3);
});

test('buildRadarArchiveIndex: cached on second call', () => {
  const a = buildRadarArchiveIndex();
  const b = buildRadarArchiveIndex();
  assert.strictEqual(a, b, 'second call must return the cached object reference');
});

test('detectRadarGaps: finds the 2024-09 / 2024-10 outage on data-bearing timestamps', () => {
  const dataBearing = getDataBearingTimestamps();
  const gaps = detectRadarGaps(dataBearing);
  assert.ok(gaps.length > 0, 'expected at least one gap on data-bearing timestamps');

  const outageGap = gaps.find((g) => g.start < '2024-09-01' && g.end > '2024-11-01');
  assert.ok(outageGap, `expected a gap spanning 2024-09 .. 2024-10; got ${JSON.stringify(gaps.slice(0, 3))}`);
  assert.ok(outageGap.missingCount > 400,
    `outage gap should span hundreds of 3h steps; got missingCount=${outageGap.missingCount}`);
});

test('detectRadarGaps: returns no gaps for a strictly contiguous list', () => {
  const list = [
    '2025-01-01T00:00:00Z',
    '2025-01-01T03:00:00Z',
    '2025-01-01T06:00:00Z',
    '2025-01-01T09:00:00Z'
  ];
  assert.deepEqual(detectRadarGaps(list, 3), []);
});

test('getArchiveCoverageForRange: a fully data-bearing window has 100% coverage', () => {
  // 2026-03 was reported as 248/248 expected/raw and high data density.
  const cov = getArchiveCoverageForRange('2026-03-01T00:00:00Z', '2026-03-01T21:00:00Z');
  assert.equal(cov.totalExpectedSteps, 8);
  assert.equal(cov.availableSteps,     8);
  assert.equal(cov.missingSteps,       0);
  assert.equal(cov.missingTimestamps.length, 0);
  assert.equal(cov.coverageRatio, 1);
  assert.equal(cov.isContinuous, true);
});

test('getArchiveCoverageForRange: a window inside the 2024-09 outage has 0% coverage', () => {
  const cov = getArchiveCoverageForRange('2024-09-15T00:00:00Z', '2024-09-15T21:00:00Z');
  assert.equal(cov.totalExpectedSteps, 8);
  assert.equal(cov.availableSteps, 0);
  assert.equal(cov.missingSteps, 8);
  assert.equal(cov.coverageRatio, 0);
  assert.equal(cov.isContinuous, false);
  assert.deepEqual(cov.missingTimestamps, [
    '2024-09-15T00:00:00Z',
    '2024-09-15T03:00:00Z',
    '2024-09-15T06:00:00Z',
    '2024-09-15T09:00:00Z',
    '2024-09-15T12:00:00Z',
    '2024-09-15T15:00:00Z',
    '2024-09-15T18:00:00Z',
    '2024-09-15T21:00:00Z'
  ]);
});

test('getArchiveCoverageForRange: a partially missing window straddling the outage', () => {
  // 2024-08-14T12Z is the last data-bearing step before the outage begins;
  // everything from 2024-08-14T15Z onward (through to 2024-11-20T03Z) is a
  // sentinel/no-data response.
  const cov = getArchiveCoverageForRange('2024-08-14T06:00:00Z', '2024-08-14T21:00:00Z');
  assert.equal(cov.totalExpectedSteps, 6);
  assert.ok(cov.missingSteps > 0, 'expected at least one missing step inside outage');
  assert.ok(cov.availableSteps > 0, 'expected at least one available step before outage');
  assert.equal(cov.isContinuous, false);
  assert.ok(cov.coverageRatio > 0 && cov.coverageRatio < 1,
    `expected partial coverage ratio; got ${cov.coverageRatio}`);
});

test('getUsableTimesteps: excludes offline-period timestamps', () => {
  const usable = getUsableTimesteps('2024-09-01T00:00:00Z', '2024-10-31T21:00:00Z');
  assert.equal(usable.length, 0,
    'expected zero usable timesteps inside the confirmed offline window');
});

test('getUsableTimesteps: excludes sentinel (no-data) timestamps even outside offline window', () => {
  // Per the archive, 2024-11-01 .. 2024-11-20T03Z are sentinel/no-data files
  // even though radarAvailability classifies post-2024-11-01 as available.
  const usable = getUsableTimesteps('2024-11-01T00:00:00Z', '2024-11-20T03:00:00Z');
  assert.equal(usable.length, 0,
    'expected sentinel/no-data timestamps to be filtered out via data-bearing index');
});

test('getUsableTimesteps: returns expected entries for a clean window', () => {
  const usable = getUsableTimesteps('2026-03-01T00:00:00Z', '2026-03-01T21:00:00Z');
  assert.deepEqual(usable, [
    '2026-03-01T00:00:00Z',
    '2026-03-01T03:00:00Z',
    '2026-03-01T06:00:00Z',
    '2026-03-01T09:00:00Z',
    '2026-03-01T12:00:00Z',
    '2026-03-01T15:00:00Z',
    '2026-03-01T18:00:00Z',
    '2026-03-01T21:00:00Z'
  ]);
});

test('validateArchiveIntegrity: archive is valid (1:1 parity, unique, consistent cadence)', () => {
  const result = validateArchiveIntegrity();
  assert.equal(result.valid, true,
    `expected archive to be valid; issues:\n${result.issues.join('\n')}`);
  assert.deepEqual(result.issues, []);
});

test('__internal.filenameToIso: parses canonical filename and rejects junk', () => {
  assert.equal(
    __internal.filenameToIso('20240901T030000Z_lizard_precipitation_australia.json'),
    '2024-09-01T03:00:00Z'
  );
  assert.equal(__internal.filenameToIso('not-a-frame.json'), null);
});

test('clearRadarArchiveIndexCache: forces a rebuild', () => {
  const before = buildRadarArchiveIndex();
  clearRadarArchiveIndexCache();
  const after = buildRadarArchiveIndex();
  assert.notStrictEqual(before, after, 'cache clear must produce a new index object');
  assert.deepEqual(before.timestamps.length, after.timestamps.length);
});
