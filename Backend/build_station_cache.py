"""
NSW Rainfall Analyser - Station Cache Builder v6
Run with: py build_station_cache.py

BEFORE RUNNING - install dependencies:
    py -m pip install requests beautifulsoup4

How it works:
  1. Fetches all MHL stations
  2. Filters to Australian rainfall gauges
  3. Finds the 5-minute rainfall timeseries ID per station
  4. Fetches the BoM IFD page for each station's coordinates
     and parses the depth table directly from the HTML
  5. Saves everything to station_cache.json

Resume: if interrupted, just run again - progress is saved.
"""

import json
import time
import logging
import re
import sys
import requests
from pathlib import Path
from datetime import datetime
from bs4 import BeautifulSoup

# ===================================================
# SET YOUR OUTPUT FOLDER HERE
# ===================================================
OUTPUT_FOLDER = r"D:\Weather App"
# ===================================================

MHL_BASE    = "https://wiski.mhl.nsw.gov.au/KiWIS/KiWIS"
BOM_IFD_URL = "http://www.bom.gov.au/water/designRainfalls/revised-ifd/"

BOM_DELAY = 3.0   # seconds between BoM requests
MHL_DELAY = 0.5   # seconds between MHL timeseries lookups

AUS_LAT_MIN, AUS_LAT_MAX = -44.0, -10.0
AUS_LON_MIN, AUS_LON_MAX = 112.0, 154.0

RAIN_KEYWORDS = ["rain", "precip"]

EXCLUDE_PATTERNS = [
    r"\bsewer\b", r"\d+mm sewer", r"\bwq\b", r"water.quality",
    r"\bbuoy\b", r"borehole", r"\bwave\b", r"\btide\b", r"\btidal\b",
    r"drain$", r"\bgpt\b", r"\bsqid\b", r"salinity",
    r"\bwind\b", r"evaporation", r"barometric", r"baro$",
    r"\btest\b", r"template", r"httpr", r"campbell",
    r"bluescope", r"offshore", r"stony.point",
]

# Duration label -> minutes mapping for parsing the BoM table
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


def setup_logging(folder):
    log_file = folder / "build_station_cache.log"
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-8s  %(message)s",
        datefmt="%H:%M:%S",
        handlers=[
            logging.FileHandler(log_file, encoding="utf-8"),
            logging.StreamHandler(sys.stdout)
        ]
    )


log = logging.getLogger(__name__)


# -------------------------------------------------------
# Step 1 - Fetch MHL station list
# -------------------------------------------------------

def fetch_mhl_stations():
    log.info("Step 1: Fetching MHL station list...")
    params = {
        "service":      "kisters",
        "type":         "queryServices",
        "request":      "getStationList",
        "format":       "json",
        "returnfields": "station_name,station_no,station_id,station_latitude,station_longitude"
    }
    resp = requests.get(MHL_BASE, params=params, timeout=30)
    resp.raise_for_status()
    raw      = resp.json()
    headers  = raw[0]
    stations = [dict(zip(headers, row)) for row in raw[1:]]
    log.info(f"  {len(stations)} total stations returned")
    return stations


# -------------------------------------------------------
# Step 2 - Filter to Australian rainfall candidates
# -------------------------------------------------------

def is_excluded(name, station_no):
    combined = (name + " " + station_no).lower()
    return any(re.search(pat, combined) for pat in EXCLUDE_PATTERNS)


def filter_stations(stations):
    log.info("\nStep 2: Filtering stations...")
    kept = []
    n_no_coords = n_outside = n_excluded = 0

    for s in stations:
        lat_str = s.get("station_latitude",  "").strip()
        lon_str = s.get("station_longitude", "").strip()

        if not lat_str or not lon_str:
            n_no_coords += 1
            continue
        try:
            lat = float(lat_str)
            lon = float(lon_str)
        except ValueError:
            n_no_coords += 1
            continue

        if not (AUS_LAT_MIN <= lat <= AUS_LAT_MAX and AUS_LON_MIN <= lon <= AUS_LON_MAX):
            n_outside += 1
            continue

        if is_excluded(s["station_name"], s["station_no"]):
            n_excluded += 1
            continue

        s["lat"] = lat
        s["lon"] = lon
        kept.append(s)

    log.info(f"  Kept {len(kept)} candidates")
    log.info(f"  Skipped - no coordinates:    {n_no_coords}")
    log.info(f"  Skipped - outside Australia: {n_outside}")
    log.info(f"  Skipped - excluded by type:  {n_excluded}")
    return kept


# -------------------------------------------------------
# Step 3 - Find rainfall timeseries ID per station
# -------------------------------------------------------

def find_rainfall_ts_id(station_id):
    params = {
        "service":      "kisters",
        "type":         "queryServices",
        "request":      "getTimeseriesList",
        "station_id":   station_id,
        "format":       "json",
        "returnfields": "ts_id,ts_name,ts_shortname,parametertype_name"
    }
    try:
        resp = requests.get(MHL_BASE, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        log.warning(f"  TS list error for {station_id}: {e}")
        return None, None

    if not data or len(data) < 2:
        return None, None

    headers       = data[0]
    best_ts_id    = None
    best_ts_name  = None
    best_priority = 99

    for row in data[1:]:
        r        = dict(zip(headers, row))
        ts_name  = r.get("ts_name",           "").lower()
        ts_short = r.get("ts_shortname",      "").lower()
        param    = r.get("parametertype_name", "").lower()
        combined = f"{ts_name} {ts_short} {param}"

        if not any(kw in combined for kw in RAIN_KEYWORDS):
            continue

        if "5" in ts_name and "min" in ts_name:
            priority = 0
        elif "5" in ts_short:
            priority = 1
        elif "raw" in ts_name or "unchecked" in ts_name:
            priority = 2
        else:
            priority = 3

        if priority < best_priority:
            best_priority = priority
            best_ts_id    = r.get("ts_id")
            best_ts_name  = r.get("ts_name")

    return best_ts_id, best_ts_name


# -------------------------------------------------------
# Step 4 - Fetch and parse BoM IFD HTML table
# -------------------------------------------------------

def fetch_bom_ifd(lat, lon):
    """
    Fetch the BoM IFD page for a lat/lon and parse the
    depth table (id='depths') directly from the HTML.

    The table structure is:
      - Header row: 63.2%, 50%, 20%, 10%, 5%, 2%, 1%
      - Data rows: <th> duration label | <td> depth values

    Returns { duration_min: { "AEP%": depth_mm } } or None.
    """
    url = (
        f"{BOM_IFD_URL}?coordinate_type=dd"
        f"&latitude={lat:.6f}&longitude={lon:.6f}"
        f"&sdmin=true&sdhr=true&sdday=true&year=2016"
    )

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) "
                      "Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-AU,en;q=0.9",
    }

    try:
        resp = requests.get(url, headers=headers, timeout=30)
        resp.raise_for_status()
    except Exception as e:
        log.warning(f"  BoM request failed: {e}")
        return None

    return parse_bom_html(resp.text)


def parse_bom_html(html):
    """
    Parse IFD depth values from the BoM IFD HTML page.
    Looks for <table id="depths"> and extracts all rows.
    """
    try:
        soup = BeautifulSoup(html, "html.parser")

        # Find the depths table
        table = soup.find("table", {"id": "depths"})
        if not table:
            log.warning("  Could not find depths table in BoM HTML")
            return None

        rows = table.find_all("tr")
        if len(rows) < 3:
            log.warning("  Depths table has too few rows")
            return None

        # Extract AEP header labels from second row
        # (first row is just the "Annual Exceedance Probability" spanning header)
        header_row = rows[1]
        aep_labels = []
        for th in header_row.find_all("th"):
            text = th.get_text(strip=True)
            if "%" in text:
                # Clean up label - remove # and * footnote markers
                clean = text.replace("#", "").replace("*", "").strip()
                aep_labels.append(clean)

        if not aep_labels:
            log.warning("  No AEP columns found in depths table")
            return None

        ifd = {}

        # Parse data rows (skip first two header rows)
        for row in rows[2:]:
            # Duration is in <th>, values in <td>
            th = row.find("th")
            if not th:
                continue

            # Get duration text and clean it
            dur_text = th.get_text(" ", strip=True).lower()

            # Skip non-data rows (seasonality etc.)
            if "winter" in dur_text or "summer" in dur_text:
                continue

            # Map duration text to minutes
            dur_min = None
            for label, minutes in DURATION_MAP.items():
                if label.lower() in dur_text:
                    dur_min = minutes
                    break

            if dur_min is None:
                # Try to extract from ifdDur ID e.g. id="ifdDur60"
                id_attr = th.get("id", "")
                m = re.search(r"ifdDur(\d+)", id_attr)
                if m:
                    dur_min = int(m.group(1))

            if dur_min is None:
                continue

            # Get depth values from <td> cells
            tds = row.find_all("td")
            aep_dict = {}
            for i, td in enumerate(tds):
                if i < len(aep_labels):
                    val_text = td.get_text(strip=True)
                    try:
                        aep_dict[aep_labels[i]] = float(val_text)
                    except ValueError:
                        pass

            if aep_dict:
                ifd[dur_min] = aep_dict

        if not ifd:
            log.warning("  Parsed IFD table is empty")
            return None

        log.info(f"  BoM IFD parsed: {len(ifd)} durations, "
                 f"AEPs: {list(list(ifd.values())[0].keys())}")
        return ifd

    except Exception as e:
        log.warning(f"  IFD parse error: {e}")
        return None


# -------------------------------------------------------
# Resume support
# -------------------------------------------------------

def load_progress(progress_file):
    if progress_file.exists():
        with open(progress_file, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_progress(progress_file, progress):
    with open(progress_file, "w", encoding="utf-8") as f:
        json.dump(progress, f, indent=2)


# -------------------------------------------------------
# Main build loop
# -------------------------------------------------------

def build_cache(output_folder):
    progress_file = output_folder / "station_cache_progress.json"
    output_file   = output_folder / "station_cache.json"
    failures_file = output_folder / "ifd_fetch_failures.json"

    all_stations = fetch_mhl_stations()
    candidates   = filter_stations(all_stations)

    progress = load_progress(progress_file)
    already  = sum(1 for v in progress.values() if v is not None)
    log.info(f"\n  Resume: {already} stations already processed")

    results  = []
    failures = []
    total    = len(candidates)

    log.info(f"\nStep 3+4: Processing {total} candidate stations")
    log.info(f"  Estimated time: ~{int(total * (MHL_DELAY + BOM_DELAY) / 60)} minutes")
    log.info(f"  Ctrl+C at any time - progress is saved\n")

    for i, s in enumerate(candidates, 1):
        sid  = s["station_id"]
        name = s["station_name"]
        lat  = s["lat"]
        lon  = s["lon"]

        # Resume: already processed
        if sid in progress:
            rec = progress[sid]
            if rec:
                log.info(f"[{i:4d}/{total}] CACHED  {name}")
                results.append(rec)
                if not rec.get("ifd"):
                    failures.append({"station_id": sid, "name": name,
                                     "lat": lat, "lon": lon})
            else:
                log.info(f"[{i:4d}/{total}] SKIP    {name}  (no rainfall ts)")
            continue

        log.info(f"[{i:4d}/{total}] {name}")

        # Step 3: find timeseries ID
        ts_id, ts_name = find_rainfall_ts_id(sid)
        time.sleep(MHL_DELAY)

        if not ts_id:
            log.info(f"  -> no rainfall timeseries, skipping")
            progress[sid] = None
            save_progress(progress_file, progress)
            continue

        log.info(f"  -> ts_id={ts_id}  ({ts_name})")

        # Step 4: fetch BoM IFD
        ifd = fetch_bom_ifd(lat, lon)
        time.sleep(BOM_DELAY)

        if ifd:
            log.info(f"  -> IFD OK ({len(ifd)} duration steps)")
        else:
            log.warning(f"  -> IFD FAILED")
            failures.append({"station_id": sid, "name": name,
                             "lat": lat, "lon": lon})

        record = {
            "station_id": sid,
            "station_no": s["station_no"],
            "name":       name,
            "lat":        lat,
            "lon":        lon,
            "ts_id":      ts_id,
            "ts_name":    ts_name,
            "ifd":        ifd,
            "built":      datetime.utcnow().isoformat()
        }

        results.append(record)
        progress[sid] = record
        save_progress(progress_file, progress)

    # Save final output - only stations with ts_id AND ifd
    final = [r for r in results if r and r.get("ts_id") and r.get("ifd")]

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(final, f, indent=2)

    if failures:
        with open(failures_file, "w", encoding="utf-8") as f:
            json.dump(failures, f, indent=2)

    n_ts = sum(1 for r in results if r and r.get("ts_id"))
    log.info(f"\n{'='*50}")
    log.info(f"DONE")
    log.info(f"  Candidates checked:  {total}")
    log.info(f"  With rainfall ts_id: {n_ts}")
    log.info(f"  With IFD data:       {len(final)}")
    log.info(f"  IFD failures:        {len(failures)}")
    log.info(f"  Output: {output_file}")
    log.info(f"{'='*50}\n")


# -------------------------------------------------------
# Entry point
# -------------------------------------------------------

if __name__ == "__main__":
    folder = Path(OUTPUT_FOLDER)
    folder.mkdir(parents=True, exist_ok=True)
    setup_logging(folder)

    log.info("="*50)
    log.info("NSW Rainfall Analyser - Station Cache Builder v6")
    log.info(f"Output: {folder}")
    log.info(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log.info("="*50 + "\n")

    try:
        build_cache(folder)
    except KeyboardInterrupt:
        log.info("\nInterrupted - progress saved, run again to resume")
    except Exception as e:
        log.exception(f"Unexpected error: {e}")
        log.info("Progress saved - run again to resume")