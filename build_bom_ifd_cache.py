import concurrent.futures
import json
import re
import threading
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parent
BOM_GAUGES = ROOT / "bom_northern_beaches_all_gauges.geojson"
OUT_JSON = ROOT / "bom_ifd_cache.json"
OUT_JS = ROOT / "bom_ifd_cache.js"
FAILURES_JSON = ROOT / "bom_ifd_failures.json"

BOM_IFD_URL = "https://www.bom.gov.au/water/designRainfalls/revised-ifd/"
MAX_WORKERS = 32
SAVE_EVERY = 25

DURATION_MAP = {
    "1 min": 1, "2 min": 2, "3 min": 3, "4 min": 4, "5 min": 5,
    "10 min": 10, "15 min": 15, "20 min": 20, "25 min": 25,
    "30 min": 30, "45 min": 45,
    "1 hour": 60, "1.5 hour": 90, "2 hour": 120, "3 hour": 180,
    "4.5 hour": 270, "6 hour": 360, "9 hour": 540, "12 hour": 720,
    "18 hour": 1080, "24 hour": 1440, "30 hour": 1800, "36 hour": 2160,
    "48 hour": 2880, "72 hour": 4320, "96 hour": 5760, "120 hour": 7200,
    "144 hour": 8640, "168 hour": 10080,
}


def location_key(lat, lon):
    return f"{lat:.5f},{lon:.5f}"


def load_json(path, fallback):
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def parse_bom_html(html):
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table", {"id": "depths"})
    if not table:
        return None
    rows = table.find_all("tr")
    if len(rows) < 3:
        return None

    aep_labels = []
    for th in rows[1].find_all("th"):
        text = th.get_text(strip=True)
        if "%" in text:
            aep_labels.append(text.replace("#", "").replace("*", "").strip())
    if not aep_labels:
        return None

    ifd = {}
    for row in rows[2:]:
        th = row.find("th")
        if not th:
            continue
        dur_text = th.get_text(" ", strip=True).lower()
        if "winter" in dur_text or "summer" in dur_text:
            continue
        dur_min = None
        for label, minutes in DURATION_MAP.items():
            if label.lower() in dur_text:
                dur_min = minutes
                break
        if dur_min is None:
            match = re.search(r"ifdDur(\d+)", th.get("id", ""))
            if match:
                dur_min = int(match.group(1))
        if dur_min is None:
            continue

        values = {}
        for index, td in enumerate(row.find_all("td")):
            if index >= len(aep_labels):
                continue
            try:
                values[aep_labels[index]] = float(td.get_text(strip=True))
            except ValueError:
                pass
        if values:
            ifd[str(dur_min)] = values
    return ifd or None


def fetch_ifd(item):
    key, lat, lon = item
    params = {
        "coordinate_type": "dd",
        "latitude": f"{lat:.6f}",
        "longitude": f"{lon:.6f}",
        "sdmin": "true",
        "sdhr": "true",
        "sdday": "true",
        "year": "2016",
    }
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-AU,en;q=0.9",
    }
    last_error = None
    for attempt in range(3):
        try:
            response = requests.get(BOM_IFD_URL, params=params, headers=headers, timeout=35)
            response.raise_for_status()
            ifd = parse_bom_html(response.text)
            if ifd:
                return key, ifd, None
            last_error = "No depths table parsed"
        except Exception as exc:
            last_error = str(exc)
        time.sleep(0.8 + attempt * 1.2)
    return key, None, last_error


def save_outputs(cache, failures):
    OUT_JSON.write_text(json.dumps(cache, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    OUT_JS.write_text(
        "window.BOM_IFD_CACHE = " + json.dumps(cache, ensure_ascii=False, sort_keys=True) + ";",
        encoding="utf-8",
    )
    FAILURES_JSON.write_text(json.dumps(failures, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")


def main():
    gauges = json.loads(BOM_GAUGES.read_text(encoding="utf-8"))
    locations = {}
    station_ids_by_location = {}
    for feature in gauges.get("features", []):
        coords = feature.get("geometry", {}).get("coordinates") or []
        if len(coords) < 2:
            continue
        lon = float(coords[0])
        lat = float(coords[1])
        key = location_key(lat, lon)
        locations[key] = (key, lat, lon)
        props = feature.get("properties", {})
        station_id = f"bom-{props.get('record_id')}"
        station_ids_by_location.setdefault(key, []).append(station_id)

    cache = load_json(OUT_JSON, {})
    failures = load_json(FAILURES_JSON, {})
    pending = [item for key, item in locations.items() if key not in cache]

    print(f"Unique BOM locations: {len(locations)}", flush=True)
    print(f"Already cached: {len(cache)}", flush=True)
    print(f"Pending: {len(pending)}", flush=True)

    done_lock = threading.Lock()
    completed = 0
    started = time.time()

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
      futures = [executor.submit(fetch_ifd, item) for item in pending]
      for future in concurrent.futures.as_completed(futures):
        key, ifd, error = future.result()
        with done_lock:
            completed += 1
            if ifd:
                cache[key] = ifd
                failures.pop(key, None)
            else:
                failures[key] = error or "Unknown error"
            if completed % SAVE_EVERY == 0 or completed == len(pending):
                save_outputs(cache, failures)
                elapsed = time.time() - started
                rate = completed / elapsed if elapsed else 0
                remaining = len(pending) - completed
                eta = remaining / rate if rate else 0
                print(
                    f"Progress {completed}/{len(pending)}; "
                    f"cache={len(cache)} failures={len(failures)}; "
                    f"{rate:.2f}/s; ETA {eta/60:.1f} min",
                    flush=True,
                )

    save_outputs(cache, failures)
    print(f"Wrote {OUT_JSON}")
    print(f"Wrote {OUT_JS}")
    print(f"Wrote {FAILURES_JSON}")


if __name__ == "__main__":
    main()
