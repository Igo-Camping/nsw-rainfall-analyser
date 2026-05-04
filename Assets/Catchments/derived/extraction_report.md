# Lizard catchment raster-derived extraction report

_Generated: 2026-05-04T00:14:39.301150+00:00_  
_Status: **OK**_  
_Source GeoTIFF: `C:\Users\fonzi\Weather App Folder\Assets\Catchments\northern-beaches-subcatchmentsZ_2026-05-04T00_05_35Z.tiff`_  
_Authoritative: **NO** -- raster-derived, non-authoritative._

## Critical disclaimer

Polygons are derived by tracing pixel boundaries of a categorical GeoTIFF. They are reproducible from the source raster but inherit the source's pixel-grid stairstep edges and any rasterisation artefacts. They are NOT a substitute for an authoritative vector catchment dataset.

## Numbers

- Catchments detected (unique colour values): **35**
- Raw polygons (one per connected component per colour): **53**
- Clean polygons after min-area + simplification + dedupe: **38**
- Rejected (below 100 m^2): **15**
- Rejected (invalid geometry): **0**

## Colour -> polygon-count mapping

| RGB / label | polygons |
|---|---:|
| `label_35` | 4 |
| `label_31` | 4 |
| `label_45` | 3 |
| `label_62` | 3 |
| `label_33` | 2 |
| `label_12` | 2 |
| `label_13` | 2 |
| `label_1` | 2 |
| `label_19` | 2 |
| `label_6` | 2 |
| `label_27` | 2 |
| `label_28` | 2 |
| `label_9` | 1 |
| `label_36` | 1 |
| `label_42` | 1 |
| `label_11` | 1 |
| `label_47` | 1 |
| `label_3` | 1 |
| `label_14` | 1 |
| `label_58` | 1 |
| `label_59` | 1 |
| `label_15` | 1 |
| `label_61` | 1 |
| `label_4` | 1 |
| `label_16` | 1 |
| `label_65` | 1 |
| `label_67` | 1 |
| `label_17` | 1 |
| `label_5` | 1 |
| `label_20` | 1 |
| `label_21` | 1 |
| `label_22` | 1 |
| `label_23` | 1 |
| `label_111` | 1 |
| `label_29` | 1 |

## Spatial accuracy

- Source pixel resolution: **4.398 m x 5.287 m**
- Boundary uncertainty: **>= 6.877 m** (one pixel diagonal)
- Note: Boundary positional uncertainty is bounded below by ONE pixel diagonal of the source raster. Sub-pixel features cannot be recovered. Treat as raster-resolution-limited.

## Validation

- Pairwise overlap issues (clean set): **0** (first 50 listed in manifest)
- Coverage audit: {'raster_data_pixel_count': 11113118, 'raster_data_area_m2': 258399663.57058156, 'polygon_total_area_m2': 258414902.24816743, 'ratio_polygon_to_raster': 1.0001, 'within_5pct': True}

## Fitness for use

- Visual overlay: **True**
- Indicative area attribution: **True**
- Design or regulatory use: **False**
- Rationale: Raster-derived polygons inherit pixel-grid stairstep edges. They are reproducible from the source raster, but are NOT a substitute for an authoritative vector dataset published by Council/Lizard.

## Warnings

- Raster-derived boundaries inherit the source pixel grid; do not over-interpret.
- If the GeoTIFF was rendered from anti-aliased map tiles, edge colours may bleed; tune --min-area-m2 / classify against source values directly.
- EPSG:4283 (GDA94 geographic) and EPSG:4326 (WGS84) differ by < 1 m for AU; outputs are written in EPSG:4326.
- These polygons MUST NOT overwrite or replace any future authoritative Council/Lizard catchment dataset.
