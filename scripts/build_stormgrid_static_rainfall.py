#!/usr/bin/env python3
"""Build Stormgrid static catchment-rainfall JSON from local Lizard archive.

Reads:
    Assets/Catchments/derived_v2/catchments_dissolved.geojson
    data/radar_archive/processed/lizard_precipitation_australia/raw_payloads/*.tif
    data/radar_archive/processed/lizard_precipitation_australia/metadata/*.json

Writes (compact JSON, separators=',:'):
    data/stormgrid/catchment_rainfall_latest.json
    stormgrid/data/catchment_rainfall_latest.json

Usage:
    python scripts/build_stormgrid_static_rainfall.py [--days N] [--end ISO] [--limit-mb 25]

Does NOT import or modify Stormgauge AEP/IFD/station/radar/export modules.
"""
import argparse
import glob
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import rasterio
from rasterio.mask import mask as rio_mask
from shapely.geometry import shape as shp_shape, mapping as shp_mapping
from shapely.ops import transform as shp_transform
from pyproj import Transformer

REPO            = Path(__file__).resolve().parent.parent
CATCHMENT_PATH  = REPO / 'Assets/Catchments/derived_v2/catchments_dissolved.geojson'
TIF_GLOB        = str(REPO / 'data/radar_archive/processed/lizard_precipitation_australia/raw_payloads/*.tif')
META_DIR        = REPO / 'data/radar_archive/processed/lizard_precipitation_australia/metadata'
OUT_PRIMARY     = REPO / 'data/stormgrid/catchment_rainfall_latest.json'
OUT_PAGE        = REPO / 'stormgrid/data/catchment_rainfall_latest.json'

SCHEMA_VERSION  = '1.0'


def parse_args():
    ap = argparse.ArgumentParser(description=__doc__.split('\n', 1)[0])
    ap.add_argument('--days', type=int, default=30,
                    help='How many days of history to include from --end backwards (default 30)')
    ap.add_argument('--end', type=str, default=None,
                    help='ISO UTC end of window (default: timestamp of latest frame in archive)')
    ap.add_argument('--limit-mb', type=float, default=25.0,
                    help='Abort if output exceeds this size in MB (default 25)')
    return ap.parse_args()


def parse_frame_ts(filename):
    base = os.path.basename(filename)
    return datetime.strptime(base.split('_')[0], '%Y%m%dT%H%M%SZ').replace(tzinfo=timezone.utc)


def load_catchments_in_4326(path):
    with open(path, 'r', encoding='utf-8') as f:
        gj = json.load(f)
    src_crs = gj.get('metadata', {}).get('projection_original') \
              or gj.get('features', [{}])[0].get('properties', {}).get('projection_original') \
              or 'EPSG:4326'
    transformer = Transformer.from_crs(src_crs, 'EPSG:4326', always_xy=True)

    def _xform(x, y, z=None):
        return transformer.transform(x, y)

    out = []
    for feat in gj['features']:
        props = feat['properties']
        geom_src = shp_shape(feat['geometry'])
        geom_4326 = shp_transform(_xform, geom_src) if str(src_crs) != 'EPSG:4326' else geom_src
        out.append({
            'id': props['catchment_id'],
            'area_ha': props.get('area_ha'),
            'centroid': [props.get('centroid_lon'), props.get('centroid_lat')],
            'bbox': [props.get('bbox_min_lon'), props.get('bbox_min_lat'),
                     props.get('bbox_max_lon'), props.get('bbox_max_lat')],
            'geom_4326': geom_4326,
        })
    return out, str(src_crs)


def collect_frames(end_dt, days):
    paths = sorted(glob.glob(TIF_GLOB))
    if not paths:
        return [], None, None
    if end_dt is None:
        end_dt = parse_frame_ts(paths[-1])
    start_dt = end_dt - timedelta(days=days)
    out = []
    for p in paths:
        try:
            ts = parse_frame_ts(p)
        except Exception:
            continue
        if start_dt <= ts <= end_dt:
            out.append((ts, p))
    return out, start_dt, end_dt


def stats_for_polygon(src, geom_4326_mapping, nodata):
    try:
        masked, _ = rio_mask(src, [geom_4326_mapping], crop=True, nodata=nodata, filled=False)
    except ValueError:
        return {'mean': None, 'min': None, 'max': None, 'median': None, 'coverage': 0.0}

    arr = masked[0]
    if hasattr(arr, 'mask'):
        valid = arr.compressed()
    else:
        valid = arr.flatten()
        if nodata is not None:
            valid = valid[valid != nodata]
    valid = valid[np.isfinite(valid)]
    valid = valid[valid > -1000.0]
    total = arr.size
    if valid.size == 0 or total == 0:
        return {'mean': None, 'min': None, 'max': None, 'median': None, 'coverage': 0.0}
    return {
        'mean':     round(float(np.mean(valid)),   4),
        'min':      round(float(np.min(valid)),    4),
        'max':      round(float(np.max(valid)),    4),
        'median':   round(float(np.median(valid)), 4),
        'coverage': round(valid.size / total, 4),
    }


def main():
    args = parse_args()
    end_dt = None
    if args.end:
        end_dt = datetime.fromisoformat(args.end.replace('Z', '+00:00'))
        if end_dt.tzinfo is None:
            end_dt = end_dt.replace(tzinfo=timezone.utc)

    print(f'[stormgrid] catchments: {CATCHMENT_PATH}', file=sys.stderr)
    catchments, catchment_src_crs = load_catchments_in_4326(CATCHMENT_PATH)
    print(f'[stormgrid] loaded {len(catchments)} catchments (src CRS: {catchment_src_crs})', file=sys.stderr)

    frames, start_dt, end_dt = collect_frames(end_dt, args.days)
    if not frames:
        print('[stormgrid] no frames in window — aborting', file=sys.stderr)
        sys.exit(2)
    print(f'[stormgrid] window: {start_dt.isoformat()} -> {end_dt.isoformat()} '
          f'({len(frames)} frames)', file=sys.stderr)

    first_meta_path = META_DIR / (Path(frames[0][1]).stem + '.json')
    meta_first = {}
    if first_meta_path.exists():
        with open(first_meta_path, 'r', encoding='utf-8') as f:
            meta_first = json.load(f)

    geom_mappings = [shp_mapping(c['geom_4326']) for c in catchments]

    out_catchments = {
        c['id']: {
            'label': c['id'],
            'area_ha': c['area_ha'],
            'centroid': c['centroid'],
            'bbox': c['bbox'],
            'stats': {'mean': [], 'min': [], 'max': [], 'median': [], 'coverage': []},
        } for c in catchments
    }
    frame_ts = []

    for i, (ts, path) in enumerate(frames):
        if i % 50 == 0 or i == len(frames) - 1:
            print(f'[stormgrid]   frame {i+1}/{len(frames)}: {ts.isoformat()}', file=sys.stderr)
        frame_ts.append(ts.strftime('%Y-%m-%dT%H:%M:%SZ'))
        with rasterio.open(path) as src:
            nodata = src.nodata
            for c, gmap in zip(catchments, geom_mappings):
                stats = stats_for_polygon(src, gmap, nodata)
                for k in ('mean', 'min', 'max', 'median', 'coverage'):
                    out_catchments[c['id']]['stats'][k].append(stats[k])

    payload = {
        'schema_version': SCHEMA_VERSION,
        'generated_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'source': {
            'kind': 'lizard_precipitation_australia',
            'raster_uuid': meta_first.get('raster_uuid'),
            'rastersource_uuid': meta_first.get('rastersource_uuid'),
            'unit': meta_first.get('unit', 'mm'),
            'interval_hours': meta_first.get('interval_hours', 3),
            'projection': meta_first.get('projection', 'EPSG:4326'),
            'note': 'Uncalibrated rainfall product. Not engineering rainfall.',
        },
        'catchment_dataset': {
            'path': str(CATCHMENT_PATH.relative_to(REPO)).replace(os.sep, '/'),
            'is_authoritative': False,
            'feature_count': len(catchments),
            'src_crs': catchment_src_crs,
        },
        'window': {
            'start': start_dt.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'end':   end_dt.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'frame_count': len(frame_ts),
        },
        'frames': frame_ts,
        'catchments': out_catchments,
    }

    raw = json.dumps(payload, separators=(',', ':')).encode('utf-8')
    size_mb = len(raw) / (1024 * 1024)
    print(f'[stormgrid] payload: {size_mb:.2f} MB', file=sys.stderr)
    if size_mb > args.limit_mb:
        print(f'[stormgrid] ABORT: payload exceeds --limit-mb={args.limit_mb}. '
              f'Reduce --days, or split the JSON into per-catchment shards.', file=sys.stderr)
        sys.exit(3)

    OUT_PRIMARY.parent.mkdir(parents=True, exist_ok=True)
    OUT_PAGE.parent.mkdir(parents=True, exist_ok=True)
    OUT_PRIMARY.write_bytes(raw)
    OUT_PAGE.write_bytes(raw)
    print(f'[stormgrid] wrote {OUT_PRIMARY.relative_to(REPO)}', file=sys.stderr)
    print(f'[stormgrid] wrote {OUT_PAGE.relative_to(REPO)}', file=sys.stderr)


if __name__ == '__main__':
    main()
