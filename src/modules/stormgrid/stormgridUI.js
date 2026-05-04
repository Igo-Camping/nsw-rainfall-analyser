// Stormgrid v0 — UI binding.
//
// Subscribes the right-side panel to the state container so any state
// change triggers a panel re-render. Owns no DOM outside the panel
// container; cleans up its subscription on unmount().

import * as state from './stormgridState.js';
import * as panel from './stormgridPanel.js';

let panelEl = null;
let unsubscribe = null;

function rerender() {
  if (!panelEl) return;
  const s = state.getState();
  if (s.isLoading) {
    panel.renderLoading(panelEl);
    return;
  }
  if (!s.isLoaded) {
    panel.renderEmpty(panelEl);
    return;
  }
  const sel = state.getSelectedFeature();
  if (sel) panel.renderFeature(panelEl, sel);
  else     panel.renderEmpty(panelEl);
}

export function mount({ panelElement }) {
  panelEl = panelElement || null;
  if (typeof unsubscribe === 'function') unsubscribe();
  unsubscribe = state.subscribe(rerender);
  rerender();
}

export function unmount() {
  if (typeof unsubscribe === 'function') unsubscribe();
  unsubscribe = null;
  if (panelEl) panel.renderEmpty(panelEl);
  panelEl = null;
}

// Test-only hook so unit tests can invoke a render without subscribing.
export function _renderForTests(panelElement) {
  panelEl = panelElement;
  rerender();
}
