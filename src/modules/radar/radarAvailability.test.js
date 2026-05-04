// Tests for radarAvailability.js
//
// Run with:  node --test src/modules/radar/radarAvailability.test.js
//
// Pure module — no I/O, no archive reads. These are unit tests against the
// frozen archive bounds and the audited known-radar periods registry.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RADAR_STATE,
  ARCHIVE_EARLIEST_ISO,
  ARCHIVE_LATEST_ISO,
  RELIABLE_DATA_START_ISO,
  KNOWN_RADAR_PERIODS,
  getRadarAvailabilityForTimestamp,
  getRadarAvailabilityForRange,
  summarizeRadarAvailability,
  hasRadarOfflineGap,
  hasRadarCoverageGap
} from './radarAvailability.js';

// =========================================================================
// Constants & registry (frozen — change requires re-audit)
// =========================================================================

test('RADAR_STATE: contains exactly the four documented states', () => {
  assert.deepEqual(RADAR_STATE, {
    AVAILABLE: 'available',
    COVERAGE_GAP: 'coverage_gap',
    OFFLINE: 'offline',
    UNKNOWN: 'unknown'
  });
});

test('Archive bounds: exact validated archive earliest/latest', () => {
  assert.equal(ARCHIVE_EARLIEST_ISO, '2017-11-20T15:00:00Z',
    'archive earliest regression — change requires re-validation');
  assert.equal(ARCHIVE_LATEST_ISO, '2026-05-10T12:00:00Z',
    'archive latest regression — change requires re-validation');
  assert.equal(RELIABLE_DATA_START_ISO, '2022-05-01T00:00:00Z',
    'reliable data start regression');
});

test('KNOWN_RADAR_PERIODS: contains exactly the audited coverage-gap and offline periods', () => {
  assert.equal(KNOWN_RADAR_PERIODS.length, 2,
    'period registry must contain exactly the two audited entries');
  const cov = KNOWN_RADAR_PERIODS.find((p) => p.state === RADAR_STATE.COVERAGE_GAP);
  const off = KNOWN_RADAR_PERIODS.find((p) => p.state === RADAR_STATE.OFFLINE);
  assert.ok(cov, 'expected one coverage_gap entry');
  assert.ok(off, 'expected one offline entry');
  assert.equal(cov.startIso, '2017-12-01T00:00:00Z');
  assert.equal(cov.endIso,   '2022-05-01T00:00:00Z');
  assert.equal(off.startIso, '2024-09-01T00:00:00Z');
  assert.equal(off.endIso,   '2024-11-01T00:00:00Z');
});

// =========================================================================
// getRadarAvailabilityForTimestamp
// =========================================================================

test('getRadarAvailabilityForTimestamp: timestamps before archive earliest are UNKNOWN', () => {
  assert.equal(getRadarAvailabilityForTimestamp('2010-01-01T00:00:00Z'), RADAR_STATE.UNKNOWN);
  assert.equal(getRadarAvailabilityForTimestamp('2017-11-20T14:59:59Z'), RADAR_STATE.UNKNOWN);
});

test('getRadarAvailabilityForTimestamp: timestamps at or after archive latest are UNKNOWN', () => {
  assert.equal(getRadarAvailabilityForTimestamp(ARCHIVE_LATEST_ISO), RADAR_STATE.UNKNOWN,
    'inclusive end-bound — exactly at LATEST is unknown');
  assert.equal(getRadarAvailabilityForTimestamp('2030-01-01T00:00:00Z'), RADAR_STATE.UNKNOWN);
});

test('getRadarAvailabilityForTimestamp: classifies the historical source-coverage gap', () => {
  assert.equal(getRadarAvailabilityForTimestamp('2018-06-15T00:00:00Z'), RADAR_STATE.COVERAGE_GAP);
  assert.equal(getRadarAvailabilityForTimestamp('2020-06-15T00:00:00Z'), RADAR_STATE.COVERAGE_GAP);
});

test('getRadarAvailabilityForTimestamp: classifies the 2024-09 / 2024-10 confirmed outage', () => {
  assert.equal(getRadarAvailabilityForTimestamp('2024-09-15T00:00:00Z'), RADAR_STATE.OFFLINE);
  assert.equal(getRadarAvailabilityForTimestamp('2024-10-31T23:59:59Z'), RADAR_STATE.OFFLINE);
});

test('getRadarAvailabilityForTimestamp: clean post-outage and pre-outage windows are AVAILABLE', () => {
  assert.equal(getRadarAvailabilityForTimestamp('2025-07-01T00:00:00Z'), RADAR_STATE.AVAILABLE);
  assert.equal(getRadarAvailabilityForTimestamp('2024-08-31T23:59:59Z'), RADAR_STATE.AVAILABLE,
    'just before the outage start must still be available');
  assert.equal(getRadarAvailabilityForTimestamp(ARCHIVE_EARLIEST_ISO), RADAR_STATE.AVAILABLE,
    'exactly at archive earliest — pre-coverage-gap available band');
});

test('getRadarAvailabilityForTimestamp: half-open boundary semantics on the offline window', () => {
  assert.equal(getRadarAvailabilityForTimestamp('2024-09-01T00:00:00Z'), RADAR_STATE.OFFLINE,
    'inclusive start of offline');
  assert.equal(getRadarAvailabilityForTimestamp('2024-11-01T00:00:00Z'), RADAR_STATE.AVAILABLE,
    'exclusive end of offline');
});

test('getRadarAvailabilityForTimestamp: half-open boundary semantics on the coverage gap', () => {
  assert.equal(getRadarAvailabilityForTimestamp('2017-12-01T00:00:00Z'), RADAR_STATE.COVERAGE_GAP,
    'inclusive start of coverage gap');
  assert.equal(getRadarAvailabilityForTimestamp('2022-05-01T00:00:00Z'), RADAR_STATE.AVAILABLE,
    'exclusive end of coverage gap');
});

test('getRadarAvailabilityForTimestamp: invalid inputs return UNKNOWN, not a thrown error', () => {
  assert.equal(getRadarAvailabilityForTimestamp(null), RADAR_STATE.UNKNOWN);
  assert.equal(getRadarAvailabilityForTimestamp(undefined), RADAR_STATE.UNKNOWN);
  assert.equal(getRadarAvailabilityForTimestamp('not-a-date'), RADAR_STATE.UNKNOWN);
  assert.equal(getRadarAvailabilityForTimestamp(NaN), RADAR_STATE.UNKNOWN);
});

test('getRadarAvailabilityForTimestamp: accepts Date and numeric millis inputs', () => {
  assert.equal(getRadarAvailabilityForTimestamp(new Date('2024-09-15T00:00:00Z')), RADAR_STATE.OFFLINE);
  assert.equal(getRadarAvailabilityForTimestamp(Date.parse('2025-07-01T00:00:00Z')), RADAR_STATE.AVAILABLE);
});

// =========================================================================
// getRadarAvailabilityForRange
// =========================================================================

test('getRadarAvailabilityForRange: empty/invalid ranges return []', () => {
  assert.deepEqual(getRadarAvailabilityForRange('2025-07-02T00:00:00Z', '2025-07-01T00:00:00Z'), [],
    'reversed range yields no segments');
  assert.deepEqual(getRadarAvailabilityForRange('2025-07-01T00:00:00Z', '2025-07-01T00:00:00Z'), [],
    'zero-duration range yields no segments');
  assert.deepEqual(getRadarAvailabilityForRange('not-a-date', '2025-07-01T00:00:00Z'), []);
});

test('getRadarAvailabilityForRange: range fully inside one state returns a single segment', () => {
  const segs = getRadarAvailabilityForRange('2025-07-01T00:00:00Z', '2025-07-04T00:00:00Z');
  assert.equal(segs.length, 1);
  assert.equal(segs[0].state, RADAR_STATE.AVAILABLE);
  assert.equal(segs[0].startIso, '2025-07-01T00:00:00.000Z');
  assert.equal(segs[0].endIso,   '2025-07-04T00:00:00.000Z');
  assert.equal(segs[0].durationMs, 3 * 24 * 3600 * 1000);
});

test('getRadarAvailabilityForRange: range crossing the offline boundary splits cleanly', () => {
  const segs = getRadarAvailabilityForRange('2024-08-15T00:00:00Z', '2024-09-15T00:00:00Z');
  assert.equal(segs.length, 2);
  assert.equal(segs[0].state, RADAR_STATE.AVAILABLE);
  assert.equal(segs[0].endIso, '2024-09-01T00:00:00.000Z');
  assert.equal(segs[1].state, RADAR_STATE.OFFLINE);
  assert.equal(segs[1].startIso, '2024-09-01T00:00:00.000Z');
  assert.equal(segs[1].endIso,   '2024-09-15T00:00:00.000Z');
  // Segment durations must sum exactly to the input window
  const total = segs.reduce((acc, s) => acc + s.durationMs, 0);
  assert.equal(total, Date.parse('2024-09-15T00:00:00Z') - Date.parse('2024-08-15T00:00:00Z'));
});

test('getRadarAvailabilityForRange: range spanning archive earliest splits UNKNOWN | AVAILABLE | COVERAGE_GAP', () => {
  const segs = getRadarAvailabilityForRange('2017-09-01T00:00:00Z', '2018-02-01T00:00:00Z');
  assert.deepEqual(segs.map((s) => s.state), [
    RADAR_STATE.UNKNOWN,
    RADAR_STATE.AVAILABLE,
    RADAR_STATE.COVERAGE_GAP
  ]);
});

test('getRadarAvailabilityForRange: adjacent same-state slices are merged into one segment', () => {
  // 2025-06-15..2025-08-15 sits entirely inside the post-2024-11 available
  // band — even with no internal boundaries, the result must be a single
  // AVAILABLE segment, not multiple.
  const segs = getRadarAvailabilityForRange('2025-06-15T00:00:00Z', '2025-08-15T00:00:00Z');
  assert.equal(segs.length, 1);
  assert.equal(segs[0].state, RADAR_STATE.AVAILABLE);
});

// =========================================================================
// summarizeRadarAvailability
// =========================================================================

test('summarizeRadarAvailability: empty/invalid range yields zero totals and UNKNOWN dominant', () => {
  const sum = summarizeRadarAvailability('2025-07-02T00:00:00Z', '2025-07-01T00:00:00Z');
  assert.equal(sum.totalMs, 0);
  assert.equal(sum.dominantState, RADAR_STATE.UNKNOWN);
  assert.equal(sum.startIso, null);
  assert.equal(sum.endIso, null);
  assert.deepEqual(sum.segments, []);
  assert.equal(sum.hasAvailable, false);
  assert.equal(sum.hasOffline, false);
  assert.equal(sum.hasCoverageGap, false);
  assert.equal(sum.hasUnknown, false);
});

test('summarizeRadarAvailability: clean available window — only hasAvailable is true', () => {
  const sum = summarizeRadarAvailability('2025-07-01T00:00:00Z', '2025-07-04T00:00:00Z');
  assert.equal(sum.dominantState, RADAR_STATE.AVAILABLE);
  assert.equal(sum.hasAvailable, true);
  assert.equal(sum.hasOffline, false);
  assert.equal(sum.hasCoverageGap, false);
  assert.equal(sum.hasUnknown, false);
  assert.equal(sum.totalMs, sum.durationsByState[RADAR_STATE.AVAILABLE]);
});

test('summarizeRadarAvailability: range crossing the offline boundary records both states', () => {
  const sum = summarizeRadarAvailability('2024-08-15T00:00:00Z', '2024-09-15T00:00:00Z');
  assert.equal(sum.hasAvailable, true);
  assert.equal(sum.hasOffline, true);
  assert.equal(sum.hasCoverageGap, false);
  assert.ok(sum.durationsByState[RADAR_STATE.AVAILABLE] > 0);
  assert.ok(sum.durationsByState[RADAR_STATE.OFFLINE] > 0);
  assert.equal(
    sum.totalMs,
    sum.durationsByState[RADAR_STATE.AVAILABLE] + sum.durationsByState[RADAR_STATE.OFFLINE],
    'totalMs must equal sum of durations across all states'
  );
});

test('summarizeRadarAvailability: dominant state is the longest-duration state', () => {
  // ~30 days available + 1 day offline → dominant must be AVAILABLE.
  const sum = summarizeRadarAvailability('2024-08-01T00:00:00Z', '2024-09-02T00:00:00Z');
  assert.equal(sum.dominantState, RADAR_STATE.AVAILABLE);
  assert.equal(sum.hasOffline, true);
});

// =========================================================================
// Convenience predicates
// =========================================================================

test('hasRadarOfflineGap: true for ranges overlapping the 2024-09 / 2024-10 outage', () => {
  assert.equal(hasRadarOfflineGap('2024-08-15T00:00:00Z', '2024-09-15T00:00:00Z'), true);
  assert.equal(hasRadarOfflineGap('2024-10-15T00:00:00Z', '2024-11-15T00:00:00Z'), true);
});

test('hasRadarOfflineGap: false for ranges fully outside the outage', () => {
  assert.equal(hasRadarOfflineGap('2025-07-01T00:00:00Z', '2025-07-04T00:00:00Z'), false);
  assert.equal(hasRadarOfflineGap('2023-01-01T00:00:00Z', '2023-02-01T00:00:00Z'), false);
});

test('hasRadarCoverageGap: true for ranges overlapping the pre-2022 source coverage gap', () => {
  assert.equal(hasRadarCoverageGap('2018-06-01T00:00:00Z', '2018-07-01T00:00:00Z'), true);
  assert.equal(hasRadarCoverageGap('2022-04-15T00:00:00Z', '2022-05-15T00:00:00Z'), true);
});

test('hasRadarCoverageGap: false for ranges fully after the coverage gap', () => {
  assert.equal(hasRadarCoverageGap('2025-07-01T00:00:00Z', '2025-07-04T00:00:00Z'), false);
  assert.equal(hasRadarCoverageGap('2024-09-01T00:00:00Z', '2024-10-01T00:00:00Z'), false,
    'offline outage is NOT a coverage gap');
});
