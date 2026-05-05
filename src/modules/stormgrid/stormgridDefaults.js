/* Stormgrid v0 — smart defaults.
   Returns the assumption each card would show before manual edits.
   No rainfall totals, no synthetic data. Values that require live
   integration return null with confidence 'unknown'. */

import { CARD_LABELS, CONFIDENCE, STATUS } from './stormgridState.js';

export function buildDefaults({ now = new Date() } = {}) {
  return {
    area: {
      key: 'area',
      label: CARD_LABELS.area,
      value: null,
      reason: 'No catchment selected. Defaults will populate from the active map selection once integration is wired.',
      confidence: CONFIDENCE.UNKNOWN,
      status: STATUS.DEFAULT,
    },
    rainfallEvent: {
      key: 'rainfallEvent',
      label: CARD_LABELS.rainfallEvent,
      value: null,
      reason: 'Event window is unset. Default will be inferred from the most recent significant exceedance once gauge data is connected.',
      confidence: CONFIDENCE.UNKNOWN,
      status: STATUS.DEFAULT,
    },
    rainfallSource: {
      key: 'rainfallSource',
      label: CARD_LABELS.rainfallSource,
      value: null,
      reason: 'Source priority will follow the existing Stormgauge order (MHL/WISKI → BOM) once the loader is bound.',
      confidence: CONFIDENCE.UNKNOWN,
      status: STATUS.DEFAULT,
    },
    gauges: {
      key: 'gauges',
      label: CARD_LABELS.gauges,
      value: null,
      reason: 'Gauge selection will default to the nearest active gauges within the chosen area.',
      confidence: CONFIDENCE.UNKNOWN,
      status: STATUS.DEFAULT,
    },
    durations: {
      key: 'durations',
      label: CARD_LABELS.durations,
      value: null,
      reason: 'Duration set will default to the standard NBC ladder once IFD reference is loaded.',
      confidence: CONFIDENCE.UNKNOWN,
      status: STATUS.DEFAULT,
    },
    ifdAep: {
      key: 'ifdAep',
      label: CARD_LABELS.ifdAep,
      value: null,
      reason: 'IFD reference will default to the cached BOM IFD for the catchment centroid.',
      confidence: CONFIDENCE.UNKNOWN,
      status: STATUS.DEFAULT,
    },
    outputs: {
      key: 'outputs',
      label: CARD_LABELS.outputs,
      value: null,
      reason: 'Output set will default to the existing Stormgauge export bundle (CSV, XLSX, PNG).',
      confidence: CONFIDENCE.UNKNOWN,
      status: STATUS.DEFAULT,
    },
    _generatedAt: now.toISOString(),
  };
}
