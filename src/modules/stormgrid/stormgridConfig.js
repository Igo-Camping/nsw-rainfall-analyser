// Stormgrid v0 — configuration constants.
//
// Single source of truth for paths, default map view, base tile service,
// and selection/zoom behaviour. The Stormgrid module imports from here;
// nothing else does. Changing any value here should be a one-line edit
// with no other module touched.

// ---------------------------------------------------------------------------
// Data sources
// ---------------------------------------------------------------------------

// Catchment GeoJSON. Produced by scripts/raster_derive_catchments_v2.py
// from the Northern Beaches subcatchment GeoTIFF. Non-authoritative
// (raster-derived); the loaded FeatureCollection's metadata.is_authoritative
// is honoured downstream.
export const CATCHMENTS_URL =
  'Assets/Catchments/derived_v2/catchments_dissolved.geojson';

// ---------------------------------------------------------------------------
// DOM mount points (must exist in index.html when stormgrid.show() is called)
// ---------------------------------------------------------------------------

export const MAP_ELEMENT_ID   = 'stormgrid-map';
export const PANEL_ELEMENT_ID = 'stormgrid-panel';

// ---------------------------------------------------------------------------
// Default map view (Northern Beaches centroid + LGA-fitting zoom)
// ---------------------------------------------------------------------------

export const DEFAULT_CENTER = [-33.75, 151.25];
export const DEFAULT_ZOOM   = 11;

// ---------------------------------------------------------------------------
// Base tile layer
//
// Duplicated here (rather than imported from src/modules/map/mapLayers.js)
// so Stormgrid does NOT depend on the Stormgauge / Atmos map helpers. Same
// upstream tile service for visual consistency. Staging-only: if the project
// later adopts a Pluviometrics-internal tile mirror, change these values
// without touching any other Stormgrid file.
// ---------------------------------------------------------------------------

export const BASE_TILE_URL =
  'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

export const BASE_TILE_OPTIONS = Object.freeze({
  attribution: '© OpenStreetMap © CARTO',
  subdomains: 'abcd',
  maxZoom: 19
});

// ---------------------------------------------------------------------------
// Selection auto-zoom
// ---------------------------------------------------------------------------

// Cap the auto-zoom on selection so we never blow past street-level for
// very small catchments. 14 ≈ ~10 m / pixel at Sydney latitude — close
// enough to see streets, far enough to keep the polygon legible.
export const FIT_MAX_ZOOM = 14;

// Pixels of padding around the polygon when fitting bounds. Both axes equal
// so framing stays symmetric across portrait/landscape catchments.
export const FIT_PADDING = Object.freeze([40, 40]);

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

// Use the browser cache aggressively — the GeoJSON is large (~6 MB) and
// changes only when the catchment derivation script reruns.
export const FETCH_CACHE_MODE = 'force-cache';
