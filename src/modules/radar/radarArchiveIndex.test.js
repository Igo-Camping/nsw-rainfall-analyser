// Tests for radarArchiveIndex.js
//
// Run with:  node --test src/modules/radar/radarArchiveIndex.test.js
//
// Uses node:test + node:assert (no third-party dependencies). Reads the
// real on-disk archive — these are integration tests, not unit tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  buildRadarArchiveIndex,
  detectRadarGaps,
  getArchiveCoverageForRange,
  getUsableTimesteps,
  validateArchiveIntegrity,
  getDataBearingTimestamps,
  getClassificationMethodCounts,
  clearRadarArchiveIndexCache,
  classifyMetadata,
  CLASSIFICATION,
  NODATA_SENTINELS,
  SENTINEL_LIZARD_NB_AOI_EMPTY_V1,
  __internal
} from './radarArchiveIndex.js';

// Build once — every test reuses the cached index.
const index = buildRadarArchiveIndex();

// =========================================================================
// Index shape
// =========================================================================

test('buildRadarArchiveIndex: timestamps are sorted and unique', () => {
  const ts = index.timestamps;
  assert.ok(ts.length > 0, 'expected non-empty timestamp list');
  for (let i = 1; i < ts.length; i++) {
    assert.ok(ts[i - 1] < ts[i], `timestamps must be strictly ascending at index ${i}`);
  }
  assert.equal(new Set(ts).size, ts.length, 'timestamps must be unique');
});

test('buildRadarArchiveIndex: exact archive size, first/last, inferred 3h timestep', () => {
  assert.equal(index.timestamps.length, 24744, 'archive timestamp count regression');
  assert.equal(index.firstTimestamp, '2017-11-20T15:00:00Z');
  assert.equal(index.lastTimestamp,  '2026-05-10T12:00:00Z');
  assert.equal(index.timestepHours, 3);
});

test('buildRadarArchiveIndex: cached on second call', () => {
  const a = buildRadarArchiveIndex();
  const b = buildRadarArchiveIndex();
  assert.strictEqual(a, b, 'second call must return the cached object reference');
});

// =========================================================================
// Sentinel registry & classification
// =========================================================================

test('NODATA_SENTINELS: registry contains only the audited Lizard NB AOI signature', () => {
  assert.equal(NODATA_SENTINELS.length, 1, 'sentinel registry must contain exactly one entry');
  assert.deepEqual(NODATA_SENTINELS[0], SENTINEL_LIZARD_NB_AOI_EMPTY_V1);
  assert.equal(SENTINEL_LIZARD_NB_AOI_EMPTY_V1.id, 'lizard_nb_aoi_empty_v1');
  assert.equal(
    SENTINEL_LIZARD_NB_AOI_EMPTY_V1.sha256,
    'f6e3d73671ad6b6827c502d269be2ff86e62e857dfa0f755378f0bb29b8a0ef1',
    'canonical sentinel sha256 regression — change requires re-audit'
  );
  assert.equal(SENTINEL_LIZARD_NB_AOI_EMPTY_V1.bytes, 1774);
});

test('classifyMetadata: classifies sentinel sha + matching bytes', () => {
  const result = classifyMetadata({
    sha256: SENTINEL_LIZARD_NB_AOI_EMPTY_V1.sha256,
    response_bytes: SENTINEL_LIZARD_NB_AOI_EMPTY_V1.bytes
  });
  assert.equal(result.classification, CLASSIFICATION.SENTINEL_SHA256);
  assert.equal(result.sentinelId, 'lizard_nb_aoi_empty_v1');
});

test('classifyMetadata: sentinel sha with mismatched bytes is unclassifiable (signature contradiction)', () => {
  const result = classifyMetadata({
    sha256: SENTINEL_LIZARD_NB_AOI_EMPTY_V1.sha256,
    response_bytes: 9999
  });
  assert.equal(result.classification, CLASSIFICATION.UNCLASSIFIABLE);
  assert.match(result.reason, /byte size.*registry/);
});

test('classifyMetadata: data-bearing for any other valid sha + bytes', () => {
  const result = classifyMetadata({
    sha256: 'a'.repeat(64),
    response_bytes: 3500
  });
  assert.equal(result.classification, CLASSIFICATION.DATA_BEARING);
});

test('classifyMetadata: unclassifiable on missing/malformed sha256', () => {
  assert.equal(classifyMetadata({}).classification, CLASSIFICATION.UNCLASSIFIABLE);
  assert.equal(classifyMetadata({ sha256: 'short', response_bytes: 100 }).classification,
    CLASSIFICATION.UNCLASSIFIABLE);
  assert.equal(classifyMetadata({ sha256: 'X'.repeat(64), response_bytes: 100 }).classification,
    CLASSIFICATION.UNCLASSIFIABLE, 'non-hex sha must be rejected');
  assert.equal(classifyMetadata(null).classification, CLASSIFICATION.UNCLASSIFIABLE);
});

test('classifyMetadata: unclassifiable on missing response_bytes', () => {
  const result = classifyMetadata({ sha256: 'a'.repeat(64) });
  assert.equal(result.classification, CLASSIFICATION.UNCLASSIFIABLE);
  assert.match(result.reason, /response_bytes/);
});

// =========================================================================
// Classification method counts (full-archive proof)
// =========================================================================

test('getClassificationMethodCounts: exact counts across the validated archive', () => {
  const counts = getClassificationMethodCounts();
  assert.equal(counts.total, 24744, 'total frames regression');
  assert.equal(counts[CLASSIFICATION.SENTINEL_SHA256], 14298,
    'sentinel-classified frame count regression — re-audit if archive content changed');
  assert.equal(counts[CLASSIFICATION.DATA_BEARING], 10446,
    'data-bearing frame count regression');
  assert.equal(counts[CLASSIFICATION.UNCLASSIFIABLE], 0,
    'every archive frame must be confidently classifiable');
  assert.equal(
    counts[CLASSIFICATION.SENTINEL_SHA256] + counts[CLASSIFICATION.DATA_BEARING],
    counts.total
  );
});

test('buildRadarArchiveIndex: classificationCounts published on the public index', () => {
  assert.deepEqual(index.classificationCounts, getClassificationMethodCounts());
});

test('getDataBearingTimestamps: count matches data_bearing classification count', () => {
  const dataBearing = getDataBearingTimestamps();
  assert.equal(dataBearing.length, 10446);
});

// =========================================================================
// Gap detection
// =========================================================================

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

// =========================================================================
// Coverage queries
// =========================================================================

test('getArchiveCoverageForRange: a fully data-bearing window has 100% coverage', () => {
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
  const cov = getArchiveCoverageForRange('2024-08-14T06:00:00Z', '2024-08-14T21:00:00Z');
  assert.equal(cov.totalExpectedSteps, 6);
  assert.ok(cov.missingSteps > 0, 'expected at least one missing step inside outage');
  assert.ok(cov.availableSteps > 0, 'expected at least one available step before outage');
  assert.equal(cov.isContinuous, false);
  assert.ok(cov.coverageRatio > 0 && cov.coverageRatio < 1,
    `expected partial coverage ratio; got ${cov.coverageRatio}`);
});

// =========================================================================
// Usable timestep filtering
// =========================================================================

test('getUsableTimesteps: excludes offline-period timestamps', () => {
  const usable = getUsableTimesteps('2024-09-01T00:00:00Z', '2024-10-31T21:00:00Z');
  assert.equal(usable.length, 0,
    'expected zero usable timesteps inside the confirmed offline window');
});

test('getUsableTimesteps: excludes sentinel (no-data) timestamps even outside offline window', () => {
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

// =========================================================================
// Integrity validation
// =========================================================================

test('validateArchiveIntegrity: real archive is valid', () => {
  const result = validateArchiveIntegrity();
  assert.equal(result.valid, true,
    `expected archive to be valid; issues:\n${result.issues.join('\n')}`);
  assert.deepEqual(result.issues, []);
  assert.equal(result.classificationCounts.unclassifiable, 0);
});

// Synthetic-archive fixtures: build tiny temporary archives to exercise
// failure modes that the real archive (intentionally) does not hit.

function makeFixture(entries) {
  const root = mkdtempSync(path.join(tmpdir(), 'radar-archive-test-'));
  mkdirSync(path.join(root, 'metadata'), { recursive: true });
  mkdirSync(path.join(root, 'raw_payloads'), { recursive: true });
  for (const e of entries) {
    const stem = `${e.stamp}_lizard_precipitation_australia`;
    if (e.metadata !== null) {
      writeFileSync(path.join(root, 'metadata', `${stem}.json`),
        typeof e.metadata === 'string' ? e.metadata : JSON.stringify(e.metadata));
    }
    if (e.tif !== false) {
      writeFileSync(path.join(root, 'raw_payloads', `${stem}.tif`), Buffer.alloc(0));
    }
  }
  return root;
}

test('validateArchiveIntegrity: fails when a metadata file is malformed JSON', () => {
  const root = makeFixture([
    { stamp: '20250101T000000Z', metadata: { sha256: 'a'.repeat(64), response_bytes: 100 } },
    { stamp: '20250101T030000Z', metadata: '{not valid json' }
  ]);
  try {
    clearRadarArchiveIndexCache();
    const result = validateArchiveIntegrity({ archiveRoot: root });
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.includes('Unclassifiable')),
      `expected an Unclassifiable issue; got: ${result.issues.join('\n')}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
    clearRadarArchiveIndexCache();
    buildRadarArchiveIndex();
  }
});

test('validateArchiveIntegrity: fails when sentinel sha + non-sentinel bytes contradict', () => {
  const root = makeFixture([
    { stamp: '20250101T000000Z', metadata: {
      sha256: SENTINEL_LIZARD_NB_AOI_EMPTY_V1.sha256,
      response_bytes: 9999  // mismatch — would silently misclassify under fuzzy logic
    }},
    { stamp: '20250101T030000Z', metadata: { sha256: 'b'.repeat(64), response_bytes: 2000 } }
  ]);
  try {
    clearRadarArchiveIndexCache();
    const result = validateArchiveIntegrity({ archiveRoot: root });
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.includes('Unclassifiable')),
      `expected an Unclassifiable issue from byte/sha mismatch; got: ${result.issues.join('\n')}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
    clearRadarArchiveIndexCache();
    buildRadarArchiveIndex();
  }
});

test('validateArchiveIntegrity: fails when .tif and .json parity is broken', () => {
  const root = makeFixture([
    { stamp: '20250101T000000Z', metadata: { sha256: 'a'.repeat(64), response_bytes: 100 }, tif: false },
    { stamp: '20250101T030000Z', metadata: { sha256: 'b'.repeat(64), response_bytes: 100 } }
  ]);
  try {
    clearRadarArchiveIndexCache();
    const result = validateArchiveIntegrity({ archiveRoot: root });
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.includes('Metadata without raster')),
      `expected parity issue; got: ${result.issues.join('\n')}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
    clearRadarArchiveIndexCache();
    buildRadarArchiveIndex();
  }
});

// =========================================================================
// Misc helpers
// =========================================================================

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
