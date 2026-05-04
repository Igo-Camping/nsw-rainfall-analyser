// Radar data availability layer.
//
// Classifies any timestamp or [start, end) range against the validated
// Lizard precipitation archive into one of four explicit states:
//
//   "available"    valid radar-derived rainfall data may exist
//   "coverage_gap" historical source-level no-data period (radar may not
//                  have been recording or AOI not covered) — DO NOT treat
//                  as zero rainfall
//   "offline"      confirmed radar outage; no recoverable data exists —
//                  DO NOT treat as zero rainfall
//   "unknown"      outside validated archive bounds or insufficient metadata
//
// Periods below are anchored to the validated archive (final backfill report,
// see data/radar_archive/reports/lizard_full_backfill_final_report.md).

export const RADAR_STATE = Object.freeze({
  AVAILABLE: 'available',
  COVERAGE_GAP: 'coverage_gap',
  OFFLINE: 'offline',
  UNKNOWN: 'unknown'
});

// Validated archive bounds — anything outside is "unknown".
export const ARCHIVE_EARLIEST_ISO = '2017-11-20T15:00:00Z';
export const ARCHIVE_LATEST_ISO   = '2026-05-10T12:00:00Z';

// Reliable Northern Beaches AOI data starts here.
export const RELIABLE_DATA_START_ISO = '2022-05-01T00:00:00Z';

// Half-open intervals: [startIso, endIso). End is exclusive.
export const KNOWN_RADAR_PERIODS = Object.freeze([
  {
    state: RADAR_STATE.COVERAGE_GAP,
    startIso: '2017-12-01T00:00:00Z',
    endIso:   '2022-05-01T00:00:00Z',
    label: 'historical source-level coverage gap (pre-AOI reliable data)'
  },
  {
    state: RADAR_STATE.OFFLINE,
    startIso: '2024-09-01T00:00:00Z',
    endIso:   '2024-11-01T00:00:00Z',
    label: 'confirmed radar offline outage'
  }
]);

const ARCHIVE_EARLIEST_MS = Date.parse(ARCHIVE_EARLIEST_ISO);
const ARCHIVE_LATEST_MS   = Date.parse(ARCHIVE_LATEST_ISO);

const KNOWN_PERIODS_MS = KNOWN_RADAR_PERIODS
  .map((p) => ({
    state: p.state,
    label: p.label,
    startMs: Date.parse(p.startIso),
    endMs:   Date.parse(p.endIso)
  }))
  .sort((a, b) => a.startMs - b.startMs);

function toMillis(input) {
  if (input == null) return NaN;
  if (input instanceof Date) return input.getTime();
  if (typeof input === 'number') return input;
  return Date.parse(String(input));
}

function classifyMillis(ms) {
  if (!Number.isFinite(ms)) return RADAR_STATE.UNKNOWN;
  if (ms < ARCHIVE_EARLIEST_MS || ms >= ARCHIVE_LATEST_MS) {
    return RADAR_STATE.UNKNOWN;
  }
  for (const period of KNOWN_PERIODS_MS) {
    if (ms >= period.startMs && ms < period.endMs) return period.state;
  }
  return RADAR_STATE.AVAILABLE;
}

export function getRadarAvailabilityForTimestamp(timestamp) {
  return classifyMillis(toMillis(timestamp));
}

// Returns an ordered list of contiguous segments covering [startIso, endIso),
// each tagged with a single state. Adjacent segments always have different
// states. Returns [] for empty or invalid ranges.
export function getRadarAvailabilityForRange(startIso, endIso) {
  const startMs = toMillis(startIso);
  const endMs   = toMillis(endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return [];
  }

  const boundaries = new Set([startMs, endMs]);
  if (ARCHIVE_EARLIEST_MS > startMs && ARCHIVE_EARLIEST_MS < endMs) {
    boundaries.add(ARCHIVE_EARLIEST_MS);
  }
  if (ARCHIVE_LATEST_MS > startMs && ARCHIVE_LATEST_MS < endMs) {
    boundaries.add(ARCHIVE_LATEST_MS);
  }
  for (const period of KNOWN_PERIODS_MS) {
    if (period.startMs > startMs && period.startMs < endMs) boundaries.add(period.startMs);
    if (period.endMs   > startMs && period.endMs   < endMs) boundaries.add(period.endMs);
  }

  const sorted = [...boundaries].sort((a, b) => a - b);
  const segments = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const segStart = sorted[i];
    const segEnd   = sorted[i + 1];
    const state = classifyMillis(segStart);
    const last = segments[segments.length - 1];
    if (last && last.state === state) {
      last.endIso = new Date(segEnd).toISOString();
      last.durationMs = segEnd - Date.parse(last.startIso);
    } else {
      segments.push({
        state,
        startIso: new Date(segStart).toISOString(),
        endIso:   new Date(segEnd).toISOString(),
        durationMs: segEnd - segStart
      });
    }
  }
  return segments;
}

export function summarizeRadarAvailability(startIso, endIso) {
  const segments = getRadarAvailabilityForRange(startIso, endIso);
  const totals = {
    [RADAR_STATE.AVAILABLE]: 0,
    [RADAR_STATE.COVERAGE_GAP]: 0,
    [RADAR_STATE.OFFLINE]: 0,
    [RADAR_STATE.UNKNOWN]: 0
  };
  for (const seg of segments) totals[seg.state] += seg.durationMs;

  const totalMs = segments.reduce((acc, s) => acc + s.durationMs, 0);
  let dominantState = RADAR_STATE.UNKNOWN;
  let dominantMs = -1;
  for (const state of Object.keys(totals)) {
    if (totals[state] > dominantMs) {
      dominantMs = totals[state];
      dominantState = state;
    }
  }

  return {
    startIso: segments[0]?.startIso ?? null,
    endIso:   segments[segments.length - 1]?.endIso ?? null,
    totalMs,
    durationsByState: totals,
    dominantState: totalMs > 0 ? dominantState : RADAR_STATE.UNKNOWN,
    hasAvailable:    totals[RADAR_STATE.AVAILABLE]    > 0,
    hasCoverageGap:  totals[RADAR_STATE.COVERAGE_GAP] > 0,
    hasOffline:      totals[RADAR_STATE.OFFLINE]      > 0,
    hasUnknown:      totals[RADAR_STATE.UNKNOWN]      > 0,
    segments
  };
}

export function hasRadarOfflineGap(startIso, endIso) {
  return summarizeRadarAvailability(startIso, endIso).hasOffline;
}

export function hasRadarCoverageGap(startIso, endIso) {
  return summarizeRadarAvailability(startIso, endIso).hasCoverageGap;
}
