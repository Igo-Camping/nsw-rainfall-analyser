"""
fetch_lga_boundaries.py

Fetches all 132 NSW LGA boundaries as full-precision polygons from the NSW
Government spatial API and saves them as a GeoJSON FeatureCollection.

No third-party packages required -- uses only Python stdlib.

Run from any folder:
    py fetch_lga_boundaries.py

Output: nsw_lga_boundaries.geojson
"""

import json
import sys
import time
import urllib.request
import urllib.parse

# Layer 8 = LocalGovernmentArea
LGA_API = (
    'https://portal.spatial.nsw.gov.au/server/rest/services/'
    'NSW_Administrative_Boundaries_Theme/FeatureServer/8/query'
)

OUTPUT_FILE = 'nsw_lga_boundaries.geojson'


def fetch_page(offset, page_size):
    params = urllib.parse.urlencode({
        'where':             '1=1',
        'outFields':         'lganame,councilname,abscode',
        'returnGeometry':    'true',
        'outSR':             '4326',       # WGS84 — ready for Leaflet
        'resultOffset':      offset,
        'resultRecordCount': page_size,
        # No maxAllowableOffset — get full resolution geometry
        'f':                 'geojson',
    })
    url = f'{LGA_API}?{params}'
    req = urllib.request.Request(
        url,
        headers={'User-Agent': 'NBC-Stormwater-LGA-Fetcher/1.0'}
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode())


def main():
    print('Fetching all NSW LGA boundaries (full precision, no simplification)...')
    print('Source: NSW Spatial Services — NSW_Administrative_Boundaries_Theme / Layer 8')
    print()

    all_features = []
    page_size = 50   # keep pages small so each HTTP response stays manageable
    offset = 0

    while True:
        end = offset + page_size
        print(f'  Fetching LGAs {offset + 1}–{end}...', end=' ', flush=True)
        try:
            data = fetch_page(offset, page_size)
        except Exception as e:
            print(f'\nERROR on page offset {offset}: {e}')
            sys.exit(1)

        features = data.get('features', [])
        all_features.extend(features)
        print(f'got {len(features)}  (total: {len(all_features)})')

        if len(features) < page_size:
            break   # last page

        offset += page_size
        time.sleep(0.3)

    print()
    print(f'Total LGAs fetched: {len(all_features)}')

    # Count total coordinate points across all polygons
    total_coords = 0
    for feature in all_features:
        geom = feature.get('geometry', {})
        coords = geom.get('coordinates', [])
        if geom.get('type') == 'Polygon':
            for ring in coords:
                total_coords += len(ring)
        elif geom.get('type') == 'MultiPolygon':
            for poly in coords:
                for ring in poly:
                    total_coords += len(ring)
    print(f'Total coordinate points: {total_coords:,}')

    # Build FeatureCollection
    geojson = {
        'type': 'FeatureCollection',
        'features': all_features
    }

    # Write compact JSON (no whitespace)
    print(f'Writing {OUTPUT_FILE}...')
    raw = json.dumps(geojson, separators=(',', ':'))
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(raw)

    size_mb = len(raw.encode('utf-8')) / 1024 / 1024
    print(f'File size: {size_mb:.1f} MB')
    print(f'Output: {OUTPUT_FILE}')
    print()

    # List all LGAs
    print('LGAs included:')
    names = sorted(
        f.get('properties', {}).get('lganame', '?')
        for f in all_features
    )
    for name in names:
        print(f'  {name}')


if __name__ == '__main__':
    main()
