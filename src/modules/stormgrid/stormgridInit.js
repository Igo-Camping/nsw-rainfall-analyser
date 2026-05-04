// Stormgrid v0 — entry point / orchestrator.
//
// Owns the lifecycle of the Stormgrid view:
//   * lazy-loads catchments_dissolved.geojson on first show()
//   * caches features in stormgridState (no re-fetch on subsequent shows)
//   * creates a dedicated Leaflet map (separate from the Stormgauge map)
//   * attaches the catchment overlay layer on show()
//   * detaches the layer fully on hide() — Leaflet listeners removed
//   * binds the right-side detail panel via stormgridUI
//
// Refinements (v0.1):
//   - All paths / defaults / tile config live in stormgridConfig.js.
//   - Stormgrid creates its own L.map() and base L.tileLayer() directly.
//     It no longer depends on window.mapInit / window.mapLayers (the
//     Stormgauge/Atmos helpers). The only window globals it touches are
//     window.L (Leaflet) and window.document.
//   - Clicking the already-selected catchment deselects it.
//   - Selecting a catchment fits the map view to that catchment's bounds
//     (capped by FIT_MAX_ZOOM).
//
// Intentionally does NOT touch any other module: no edits to AEP, IFD,
// stations, radar rendering, exports, fallback algorithms, or branding.

import * as state    from './stormgridState.js';
import * as mapLayer from './stormgridMapLayer.js';
import * as panel    from './stormgridPanel.js';
import * as ui       from './stormgridUI.js';
import * as cfg      from './stormgridConfig.js';

let stormgridMap     = null;
let layerHandle      = null;
let _loadPromise     = null;
let _layerStateUnsub = null;
let _uiMounted       = false;

function getElement(id) {
  return typeof document !== 'undefined' ? document.getElementById(id) : null;
}

// ---------------------------------------------------------------------------
// Map creation — self-contained (does not depend on Stormgauge/Atmos helpers)
// ---------------------------------------------------------------------------

function ensureMap(L) {
  if (stormgridMap) return stormgridMap;
  if (!L) throw new Error('Stormgrid: window.L (Leaflet) is not available');
  if (!getElement(cfg.MAP_ELEMENT_ID)) {
    throw new Error('Stormgrid: map mount element #' + cfg.MAP_ELEMENT_ID + ' not found in DOM');
  }
  stormgridMap = L.map(cfg.MAP_ELEMENT_ID).setView(cfg.DEFAULT_CENTER, cfg.DEFAULT_ZOOM);
  L.tileLayer(cfg.BASE_TILE_URL, cfg.BASE_TILE_OPTIONS).addTo(stormgridMap);
  return stormgridMap;
}

// ---------------------------------------------------------------------------
// Catchment data load (lazy, cached)
// ---------------------------------------------------------------------------

async function ensureCatchmentsLoaded() {
  if (state.isLoaded()) return state.getCatchmentFeatures();
  if (_loadPromise) return _loadPromise;

  state.setLoading(true);
  _loadPromise = fetch(cfg.CATCHMENTS_URL, { cache: cfg.FETCH_CACHE_MODE })
    .then((response) => {
      if (!response.ok) {
        throw new Error('Stormgrid: failed to load catchments (HTTP ' + response.status + ')');
      }
      return response.json();
    })
    .then((featureCollection) => {
      const features = (featureCollection && Array.isArray(featureCollection.features))
        ? featureCollection.features
        : [];
      state.setFeatures(features);
      return features;
    })
    .catch((err) => {
      state.setLoading(false);
      _loadPromise = null;        // allow a retry on next show()
      throw err;
    });
  return _loadPromise;
}

// ---------------------------------------------------------------------------
// Layer attach / detach
// ---------------------------------------------------------------------------

function attachLayer(L, features) {
  if (layerHandle) return layerHandle;

  layerHandle = mapLayer.createCatchmentLayer({
    L,
    map: stormgridMap,
    features,
    onClick: (feature) => {
      const id = feature && feature.properties && feature.properties.catchment_id;
      if (!id) return;
      const currentSelected = state.getSelectedCatchmentId();
      if (currentSelected === id) {
        // Toggle: clicking the already-selected catchment deselects it.
        state.clearSelection();
      } else {
        state.setSelectedCatchmentId(id);
        // Fit to feature on a fresh selection (not on deselect).
        if (layerHandle && typeof layerHandle.fitToFeature === 'function') {
          layerHandle.fitToFeature(id);
        }
      }
    }
  });

  // Bridge state -> layer style. Selection is the source of truth in state;
  // the layer's setSelected mirrors it. This keeps any future programmatic
  // selection in sync with the visual highlight.
  _layerStateUnsub = state.subscribe((s) => {
    if (layerHandle) layerHandle.setSelected(s.selectedCatchmentId);
  });

  layerHandle.addTo(stormgridMap);
  // Reflect the current selection (if any) onto the freshly attached layer.
  layerHandle.setSelected(state.getSelectedCatchmentId());
  return layerHandle;
}

function detachLayer() {
  if (typeof _layerStateUnsub === 'function') {
    _layerStateUnsub();
    _layerStateUnsub = null;
  }
  if (layerHandle) {
    layerHandle.removeFrom(stormgridMap);
    layerHandle = null;
  }
}

function invalidateMapSize() {
  if (!stormgridMap) return;
  // Re-tickle Leaflet after the page becomes visible (Leaflet doesn't
  // measure hidden containers correctly).
  requestAnimationFrame(() => {
    try { stormgridMap.invalidateSize(); } catch { /* noop */ }
    setTimeout(() => { try { stormgridMap.invalidateSize(); } catch { /* noop */ } }, 80);
    setTimeout(() => { try { stormgridMap.invalidateSize(); } catch { /* noop */ } }, 250);
  });
}

// ---------------------------------------------------------------------------
// Public lifecycle
// ---------------------------------------------------------------------------

export async function show() {
  state.setActive(true);

  const panelEl = getElement(cfg.PANEL_ELEMENT_ID);
  if (!_uiMounted) {
    ui.mount({ panelElement: panelEl });
    _uiMounted = true;
  } else if (panelEl) {
    // Panel element may have been re-rendered; re-mount to refresh binding.
    ui.unmount();
    ui.mount({ panelElement: panelEl });
  }

  const L = (typeof window !== 'undefined') ? window.L : null;
  try {
    ensureMap(L);
    invalidateMapSize();
    panel.renderLoading(panelEl);
    const features = await ensureCatchmentsLoaded();
    if (!Array.isArray(features) || features.length === 0) {
      panel.renderError(panelEl, 'No catchments available.');
      return;
    }
    attachLayer(L, features);
    // After attach, force one more invalidate so polygons render.
    invalidateMapSize();
    // Render whatever the current selection is (or empty state).
    const sel = state.getSelectedFeature();
    if (sel) panel.renderFeature(panelEl, sel);
    else     panel.renderEmpty(panelEl);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[Stormgrid] show() failed:', err);
    panel.renderError(panelEl, err && err.message ? err.message : 'Stormgrid failed to load.');
  }
}

export function hide() {
  state.setActive(false);
  detachLayer();
  if (_uiMounted) {
    ui.unmount();
    _uiMounted = false;
  }
}

export function isActive() {
  return state.isActive();
}

// Internal handles — exported for diagnostics only. Not part of the
// public surface; subject to change.
export function _internal() {
  return {
    stormgridMap,
    layerHandle,
    catchmentsUrl: cfg.CATCHMENTS_URL,
    mapElementId: cfg.MAP_ELEMENT_ID,
    panelElementId: cfg.PANEL_ELEMENT_ID
  };
}
