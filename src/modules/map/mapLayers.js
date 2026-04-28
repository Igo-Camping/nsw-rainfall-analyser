const DEFAULT_BASE_TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const DEFAULT_BASE_TILE_OPTIONS = {
  attribution: '\u00A9 OpenStreetMap \u00A9 CARTO',
  subdomains: 'abcd',
  maxZoom: 19
};

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
