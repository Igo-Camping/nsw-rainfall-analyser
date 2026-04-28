const DEFAULT_BASE_TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const DEFAULT_BASE_TILE_OPTIONS = {
  attribution: '\u00A9 OpenStreetMap \u00A9 CARTO',
  subdomains: 'abcd',
  maxZoom: 19
};
const RADAR_PANE_NAME = 'atmos-radar-pane';
const RADAR_PANE_Z_INDEX = 450;

export function addAtmosBaseLayer(map, {
  L,
  tileUrl = DEFAULT_BASE_TILE_URL,
  tileOptions = {}
}) {
  return L.tileLayer(tileUrl, {
    ...DEFAULT_BASE_TILE_OPTIONS,
    ...tileOptions
  }).addTo(map);
}

export function ensureAtmosRadarPane(map, {
  paneName = RADAR_PANE_NAME,
  zIndex = RADAR_PANE_Z_INDEX
} = {}) {
  const pane = map.getPane(paneName) || map.createPane(paneName);
  pane.style.zIndex = String(zIndex);
  pane.style.pointerEvents = 'none';
  return paneName;
}
