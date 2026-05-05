/* Stormgrid v0 — state container.
   Isolated from Stormgauge. Holds smart-default review state only.
   No rainfall data, no analysis results, no exports. */

export const STORMGRID_VERSION = 'v0-shell';

export const CARD_KEYS = Object.freeze([
  'area',
  'rainfallEvent',
  'rainfallSource',
  'gauges',
  'durations',
  'ifdAep',
  'outputs',
]);

export const CARD_LABELS = Object.freeze({
  area:           'Area',
  rainfallEvent:  'Rainfall event',
  rainfallSource: 'Rainfall source',
  gauges:         'Gauges',
  durations:      'Durations',
  ifdAep:         'IFD / AEP reference',
  outputs:        'Outputs',
});

export const STATUS = Object.freeze({
  DEFAULT: 'default',
  MANUAL:  'manually-changed',
});

export const CONFIDENCE = Object.freeze({
  HIGH:    'high',
  MEDIUM:  'medium',
  LOW:     'low',
  UNKNOWN: 'unknown',
});

export function createStormgridState() {
  return {
    version: STORMGRID_VERSION,
    integrationReady: false,
    cards: CARD_KEYS.reduce((acc, key) => {
      acc[key] = {
        key,
        label: CARD_LABELS[key],
        value: null,
        reason: '',
        confidence: CONFIDENCE.UNKNOWN,
        status: STATUS.DEFAULT,
      };
      return acc;
    }, {}),
  };
}

export function markManuallyChanged(state, cardKey, nextValue) {
  const card = state.cards[cardKey];
  if (!card) throw new Error(`Stormgrid: unknown card key "${cardKey}"`);
  card.value = nextValue;
  card.status = STATUS.MANUAL;
  return state;
}

export function resetCardToDefault(state, cardKey, defaultCard) {
  const card = state.cards[cardKey];
  if (!card) throw new Error(`Stormgrid: unknown card key "${cardKey}"`);
  Object.assign(card, defaultCard, { status: STATUS.DEFAULT });
  return state;
}
