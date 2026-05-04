// Stormgrid v0 — catchment Leaflet layer.
//
// Builds an L.geoJSON layer of catchment polygons, with O(1) per-feature
// restyling on hover and selection. The whole layer is NEVER restyled
// after creation — only the affected polygon (and its predecessor) get a
// setStyle() call. The layer can be detached cleanly from the map.
//
// No DOM access outside Leaflet. No globals. The factory takes L + map +
// features and returns a thin handle the caller drives.

const PANE_NAME = 'stormgrid-catchments-pane';
const PANE_Z_INDEX = 410;          // above base (0), below typical overlay (450)

// Style functions — all derive fillColor from feature.properties.rgb_hex,
// falling back to a neutral grey when absent.
function styleDefault(feature) {
  return {
    color: '#3D4754',
    weight: 1,
    opacity: 0.75,
    fillColor: (feature && feature.properties && feature.properties.rgb_hex) || '#888888',
    fillOpacity: 0.18
  };
}
function styleHover(feature) {
  return {
    ...styleDefault(feature),
    weight: 2,
    opacity: 1,
    fillOpacity: 0.34
  };
}
function styleSelected(feature) {
  return {
    ...styleDefault(feature),
    color: '#1A2B3C',
    weight: 3,
    opacity: 1,
    fillOpacity: 0.42
  };
}

export function ensureCatchmentPane(map) {
  const pane = map.getPane(PANE_NAME) || map.createPane(PANE_NAME);
  pane.style.zIndex = String(PANE_Z_INDEX);
  return PANE_NAME;
}

export function createCatchmentLayer({
  L, map, features,
  onClick = null,
  onHover = null,
  onUnhover = null
}) {
  if (!L)   throw new Error('createCatchmentLayer requires Leaflet (L)');
  if (!map) throw new Error('createCatchmentLayer requires a Leaflet map');
  if (!Array.isArray(features) || features.length === 0) {
    throw new Error('createCatchmentLayer requires a non-empty features array');
  }

  const paneName = ensureCatchmentPane(map);
  const fc = { type: 'FeatureCollection', features };
  const byId = new Map();           // catchment_id -> Leaflet sub-layer
  let hoveredId = null;
  let selectedId = null;

  function styleFor(id, feature) {
    if (id === selectedId) return styleSelected(feature);
    if (id === hoveredId)  return styleHover(feature);
    return styleDefault(feature);
  }
  function restyleOne(id) {
    const lyr = byId.get(id);
    if (!lyr) return;
    lyr.setStyle(styleFor(id, lyr.feature));
    if (id === selectedId || id === hoveredId) lyr.bringToFront();
  }

  const geoJsonLayer = L.geoJSON(fc, {
    pane: paneName,
    style: (feature) => styleDefault(feature),
    onEachFeature: (feature, lyr) => {
      const id = feature && feature.properties && feature.properties.catchment_id;
      if (!id) return;
      byId.set(id, lyr);

      // Hover affordance: tooltip with catchment_id + style change.
      lyr.bindTooltip(String(id), {
        sticky: true,
        direction: 'top',
        className: 'stormgrid-tooltip'
      });

      lyr.on('mouseover', () => {
        const prev = hoveredId;
        hoveredId = id;
        if (prev && prev !== id) restyleOne(prev);
        restyleOne(id);
        if (typeof onHover === 'function') onHover(feature, lyr);
      });
      lyr.on('mouseout', () => {
        const prev = hoveredId;
        hoveredId = null;
        if (prev) restyleOne(prev);
        if (typeof onUnhover === 'function') onUnhover(feature, lyr);
      });
      lyr.on('click', () => {
        if (typeof onClick === 'function') onClick(feature, lyr);
      });
    }
  });

  return {
    layer: geoJsonLayer,

    addTo(targetMap) {
      if (targetMap) geoJsonLayer.addTo(targetMap);
      return this;
    },

    removeFrom(targetMap) {
      // Detach Leaflet event listeners on each sub-layer too, to avoid
      // dangling handlers if the layer is recreated later.
      byId.forEach((lyr) => {
        try { lyr.off(); } catch { /* ignore */ }
      });
      if (targetMap && geoJsonLayer) targetMap.removeLayer(geoJsonLayer);
      byId.clear();
      hoveredId = null;
      selectedId = null;
      return this;
    },

    setSelected(id) {
      const next = id == null ? null : String(id);
      if (selectedId === next) return;
      const prev = selectedId;
      selectedId = next;
      if (prev) restyleOne(prev);
      if (next) restyleOne(next);
    },

    getSelected() { return selectedId; },

    fitToFeature(id) {
      const lyr = byId.get(id);
      if (lyr && map && typeof lyr.getBounds === 'function') {
        map.fitBounds(lyr.getBounds(), { maxZoom: 14, padding: [40, 40] });
      }
    },

    getCatchmentIds() { return Array.from(byId.keys()); }
  };
}
