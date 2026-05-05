/* Stormgrid v0 — smart defaults.
   Deterministic, logic-based assumptions for each card.
   No external APIs, no rainfall data, no randomness.
   Manual overrides via the UI flip status to manually-changed.

   When a map context is supplied (from stormgridMapBridge), the Area
   card and the Rainfall event reason adapt to the current viewport.
   Otherwise the static fallbacks are used. */

import { CARD_LABELS, CONFIDENCE, STATUS } from './stormgridState.js';

export function buildDefaults({ now = new Date(), map = null } = {}) {
  const bounds = map && map.bounds ? map.bounds : null;
  const center = map && map.center ? map.center : null;

  const area = bounds
    ? {
        key: 'area',
        label: CARD_LABELS.area,
        value: formatViewport(bounds),
        reason: 'Derived from current map view extent.',
        confidence: CONFIDENCE.MEDIUM,
        status: STATUS.DEFAULT,
      }
    : {
        key: 'area',
        label: CARD_LABELS.area,
        value: 'Map view (not yet selected)',
        reason: 'No polygon provided. Defaulting to current map viewport.',
        confidence: CONFIDENCE.LOW,
        status: STATUS.DEFAULT,
      };

  const rainfallEventReason = center
    ? 'Defaulting to most recent event near current map view.'
    : 'Defaulting to most recent analysis window for rapid assessment.';

  return {
    area,
    rainfallEvent: {
      key: 'rainfallEvent',
      label: CARD_LABELS.rainfallEvent,
      value: 'Last 24 hours (rolling)',
      reason: rainfallEventReason,
      confidence: CONFIDENCE.MEDIUM,
      status: STATUS.DEFAULT,
    },
    rainfallSource: {
      key: 'rainfallSource',
      label: CARD_LABELS.rainfallSource,
      value: 'Rainfall radar (preferred), fallback to gauges',
      reason: 'Radar provides spatial coverage; gauges used for validation.',
      confidence: CONFIDENCE.HIGH,
      status: STATUS.DEFAULT,
    },
    gauges: {
      key: 'gauges',
      label: CARD_LABELS.gauges,
      value: 'Nearest 3–5 gauges (auto-selected)',
      reason: 'Provides local validation against spatial rainfall.',
      confidence: CONFIDENCE.MEDIUM,
      status: STATUS.DEFAULT,
    },
    durations: {
      key: 'durations',
      label: CARD_LABELS.durations,
      value: 'Standard durations: 5 min → 24 hr',
      reason: 'Matches Stormgauge standard duration set.',
      confidence: CONFIDENCE.HIGH,
      status: STATUS.DEFAULT,
    },
    ifdAep: {
      key: 'ifdAep',
      label: CARD_LABELS.ifdAep,
      value: 'Nearest IFD point (to be resolved)',
      reason: 'IFD reference required for later comparison.',
      confidence: CONFIDENCE.LOW,
      status: STATUS.DEFAULT,
    },
    outputs: {
      key: 'outputs',
      label: CARD_LABELS.outputs,
      value: 'Full export pack (HTML, XLSX, CSV, GeoJSON)',
      reason: 'Default reporting bundle for engineering use.',
      confidence: CONFIDENCE.HIGH,
      status: STATUS.DEFAULT,
    },
    _generatedAt: now.toISOString(),
  };
}

function formatViewport({ north, south, east, west }) {
  const latLo = Math.min(south, north);
  const latHi = Math.max(south, north);
  const lonLo = Math.min(west, east);
  const lonHi = Math.max(west, east);
  const f = (n) => n.toFixed(4);
  return `Viewport (lat ${f(latLo)}–${f(latHi)}, lon ${f(lonLo)}–${f(lonHi)})`;
}
