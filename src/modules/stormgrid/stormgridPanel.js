// Stormgrid v0 — right-side detail panel renderer.
//
// Pure DOM stamping into the supplied container. No subscribes, no event
// wiring — callers (stormgridUI) re-call render*() on state changes. The
// panel owns NO layout outside its own root element.

const NUMBER_LOCALE = 'en-AU';

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function fmtNumber(value, fractionDigits) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(NUMBER_LOCALE, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  });
}

function fmtCoord(value, fractionDigits) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(fractionDigits);
}

export function renderEmpty(panelEl) {
  if (!panelEl) return;
  panelEl.innerHTML =
    '<div class="stormgrid-panel-empty" role="status">Select a catchment</div>';
}

export function renderLoading(panelEl) {
  if (!panelEl) return;
  panelEl.innerHTML =
    '<div class="stormgrid-panel-empty" role="status">Loading catchments…</div>';
}

export function renderError(panelEl, message) {
  if (!panelEl) return;
  const text = escapeHtml(message || 'Could not load catchments.');
  panelEl.innerHTML =
    '<div class="stormgrid-panel-error" role="alert">' + text + '</div>';
}

export function renderFeature(panelEl, feature) {
  if (!panelEl) return;
  if (!feature || !feature.properties) {
    renderEmpty(panelEl);
    return;
  }
  const p = feature.properties;
  const id          = escapeHtml(p.catchment_id || '—');
  const swatchHex   = escapeHtml(p.rgb_hex || '#888888');
  const areaHa      = fmtNumber(p.area_ha, 1);
  const perimKm     = fmtNumber((Number(p.perimeter_m) || 0) / 1000, 2);
  const lat         = fmtCoord(p.centroid_lat, 4);
  const lon         = fmtCoord(p.centroid_lon, 4);
  const partCount   = Number.isFinite(p.part_count) ? p.part_count : 1;
  const geomType    = escapeHtml(p.geometry_type || '—');

  panelEl.innerHTML =
    '<header class="stormgrid-panel-header">' +
      '<span class="stormgrid-panel-swatch" style="background:' + swatchHex + '"></span>' +
      '<h2 class="stormgrid-panel-title">' + id + '</h2>' +
    '</header>' +
    '<dl class="stormgrid-panel-grid">' +
      '<dt>Area</dt><dd>' + areaHa + ' ha</dd>' +
      '<dt>Perimeter</dt><dd>' + perimKm + ' km</dd>' +
      '<dt>Centroid (lat, lon)</dt><dd>' + lat + ', ' + lon + '</dd>' +
      '<dt>Geometry</dt><dd>' + geomType + ' · ' + partCount +
        ' part' + (partCount === 1 ? '' : 's') + '</dd>' +
    '</dl>';
}
