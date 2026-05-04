// Stormgrid v0 — state container.
//
// Tiny pub/sub. Pure JS, no DOM, no globals. Owns the four pieces of state
// the spec requires: isActive, selectedCatchmentId, catchmentFeatures,
// isLoaded. Adds isLoading as a transient flag so the UI can render a
// "loading" panel while the GeoJSON fetch is in flight.
//
// Notification rule: subscribers are only invoked when state actually
// changes. No-op setters return early without firing.

const state = {
  isActive: false,
  isLoaded: false,
  isLoading: false,
  catchmentFeatures: null,        // Array<GeoJSONFeature> | null
  selectedCatchmentId: null       // string | null
};

const listeners = new Set();

function snapshot() {
  return {
    isActive: state.isActive,
    isLoaded: state.isLoaded,
    isLoading: state.isLoading,
    catchmentFeatures: state.catchmentFeatures,
    selectedCatchmentId: state.selectedCatchmentId
  };
}

function notify() {
  const s = snapshot();
  for (const fn of listeners) {
    try { fn(s); } catch (err) {
      // Listener errors must never break the dispatcher.
      // eslint-disable-next-line no-console
      console.error('[stormgridState] subscriber threw:', err);
    }
  }
}

export function getState()                  { return snapshot(); }
export function isActive()                  { return state.isActive; }
export function isLoaded()                  { return state.isLoaded; }
export function isLoading()                 { return state.isLoading; }
export function getSelectedCatchmentId()    { return state.selectedCatchmentId; }
export function getCatchmentFeatures()      { return state.catchmentFeatures; }

export function setActive(active) {
  const next = Boolean(active);
  if (state.isActive === next) return;
  state.isActive = next;
  notify();
}

export function setLoading(loading) {
  const next = Boolean(loading);
  if (state.isLoading === next) return;
  state.isLoading = next;
  notify();
}

export function setFeatures(features) {
  if (Array.isArray(features)) {
    state.catchmentFeatures = features;
    state.isLoaded = true;
  } else {
    state.catchmentFeatures = null;
    state.isLoaded = false;
  }
  state.isLoading = false;
  notify();
}

export function setSelectedCatchmentId(id) {
  const next = id == null ? null : String(id);
  if (state.selectedCatchmentId === next) return;
  state.selectedCatchmentId = next;
  notify();
}

export function clearSelection() {
  setSelectedCatchmentId(null);
}

export function getSelectedFeature() {
  const id = state.selectedCatchmentId;
  const features = state.catchmentFeatures;
  if (!id || !Array.isArray(features)) return null;
  for (const f of features) {
    if (f && f.properties && f.properties.catchment_id === id) return f;
  }
  return null;
}

export function subscribe(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('stormgridState.subscribe requires a function');
  }
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Test-only reset hook. Not for runtime use.
export function _resetForTests() {
  state.isActive = false;
  state.isLoaded = false;
  state.isLoading = false;
  state.catchmentFeatures = null;
  state.selectedCatchmentId = null;
  listeners.clear();
}
