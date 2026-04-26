#!/usr/bin/env python3
"""
enrich_ifd.py — IFD enrichment pipeline for pluviometrics_rainfall_stations.json

For every station in the consolidated dataset:
  - MHL  → GET /stations/{station_id} from backend API, extract .ifd
  - BOM  → lookup bom_ifd_cache.js by lat/lon key (5 decimal places)

Outputs:
  data/pluviometrics_ifd_table.json   — final enriched table
  data/pluviometrics_ifd_table.csv    — wide-format review table
  data/pluviometrics_ifd_cache.json   — resume cache (intermediate results)
  data/pluviometrics_ifd_errors.json  — stations that could not be enriched

Resume: cached entries are skipped unless --force is passed.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

ROOT           = Path(__file__).resolve().parents[1]
DEFAULT_INPUT  = ROOT / "data" / "pluviometrics_rainfall_stations.json"
DEFAULT_OUTPUT = ROOT / "data" / "pluviometrics_ifd_table.json"
CACHE_FILE     = ROOT / "data" / "pluviometrics_ifd_cache.json"
ERROR_FILE     = ROOT / "data" / "pluviometrics_ifd_errors.json"
BOM_IFD_JS     = ROOT / "bom_ifd_cache.js"

API_BASE = "https://nsw-rainfall-analyser-api.onrender.com"

# AEP column order matching Stormgauge
AEP_ORDER = ["63.2%", "50%", "20%", "10%", "5%", "2%", "1%"]


# ---------------------------------------------------------------------------
# BOM IFD cache
# ---------------------------------------------------------------------------

def ifd_key(lat: float, lon: float) -> str:
    return f"{lat:.5f},{lon:.5f}"


def load_bom_ifd_cache(js_path: Path) -> dict:
    text = js_path.read_text(encoding="utf-8").strip()
    prefix = "window.BOM_IFD_CACHE = "
    if not text.startswith(prefix):
        raise ValueError(f"Unexpected format in {js_path} — expected 'window.BOM_IFD_CACHE = ...'")
    json_str = text[len(prefix):]
    if json_str.endswith(";"):
        json_str = json_str[:-1]
    return json.loads(json_str)


def lookup_bom_ifd(station: dict, bom_cache: dict) -> tuple[dict | None, str | None]:
    """Look up IFD for a BOM station by lat/lon key, with small-tolerance fallback."""
    lat = station["lat"]
    lon = station["lon"]
    key = ifd_key(lat, lon)
    if key in bom_cache:
        return bom_cache[key], key

    # Floating-point precision fallback: search within ±0.0001 degrees (~10 m)
    tolerances = [0.00001, 0.0001, 0.001]
    for tol in tolerances:
        for dlat in (-tol, 0.0, tol):
            for dlon in (-tol, 0.0, tol):
                if dlat == 0.0 and dlon == 0.0:
                    continue
                k2 = ifd_key(lat + dlat, lon + dlon)
                if k2 in bom_cache:
                    return bom_cache[k2], k2

    return None, None


# ---------------------------------------------------------------------------
# MHL IFD fetch
# ---------------------------------------------------------------------------

def fetch_mhl_ifd(station_id: str, retries: int = 3, backoff: float = 2.0) -> dict:
    url = f"{API_BASE}/stations/{station_id}"
    last_exc: Exception = Exception("No attempts made")
    for attempt in range(retries):
        try:
            req = Request(
                url,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "pluviometrics-ifd-enrichment/1.0",
                },
            )
            with urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
            ifd = data.get("ifd")
            if not isinstance(ifd, dict) or not ifd:
                raise ValueError(f"Response has no usable 'ifd' field (keys: {list(data.keys())})")
            return ifd
        except HTTPError as e:
            if e.code == 404:
                raise ValueError(f"Station {station_id} not found (HTTP 404)")
            last_exc = e
        except (URLError, OSError) as e:
            last_exc = e
        if attempt < retries - 1:
            time.sleep(backoff ** attempt)
    raise ValueError(f"All {retries} attempts failed: {last_exc}")


# ---------------------------------------------------------------------------
# Per-station enrichment
# ---------------------------------------------------------------------------

def enrich_station(
    station: dict,
    bom_cache: dict,
) -> tuple[str, dict | None, str | None]:
    """
    Returns (station_id, ifd_dict, error_msg).
    One of ifd_dict or error_msg is None.
    """
    sid = station["station_id"]
    src = station.get("source", "")

    try:
        if src == "mhl":
            ifd = fetch_mhl_ifd(sid)
            return sid, ifd, None

        if src == "bom":
            ifd, matched_key = lookup_bom_ifd(station, bom_cache)
            if ifd is None:
                return sid, None, (
                    f"No IFD key found for lat={station['lat']:.5f} lon={station['lon']:.5f}"
                )
            return sid, ifd, None

        return sid, None, f"Unknown source: {src!r}"

    except Exception as exc:
        return sid, None, str(exc)


# ---------------------------------------------------------------------------
# Cache / resume helpers
# ---------------------------------------------------------------------------

def load_json_safe(path: Path) -> dict:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# CSV export
# ---------------------------------------------------------------------------

def write_csv(output_path: Path, stations_meta: list[dict], ifd_results: dict) -> None:
    """Write a wide-format CSV: one row per station × duration."""
    rows = []
    for meta in stations_meta:
        sid = meta["station_id"]
        ifd = ifd_results.get(sid)
        if not ifd:
            continue
        for dur_str, aep_row in sorted(ifd.items(), key=lambda x: int(x[0])):
            row = {
                "station_id": sid,
                "station_name": meta.get("station_name", ""),
                "source": meta.get("source", ""),
                "lat": meta.get("lat", ""),
                "lon": meta.get("lon", ""),
                "data_identifier": meta.get("data_identifier", ""),
                "duration_minutes": int(dur_str),
            }
            for aep in AEP_ORDER:
                row[aep] = aep_row.get(aep, "")
            rows.append(row)

    if not rows:
        return

    fieldnames = list(rows[0].keys())
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Enrich pluviometrics station dataset with IFD tables.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument(
        "--input", type=Path, default=DEFAULT_INPUT,
        help="Path to pluviometrics_rainfall_stations.json",
    )
    p.add_argument(
        "--output", type=Path, default=DEFAULT_OUTPUT,
        help="Path for output pluviometrics_ifd_table.json",
    )
    p.add_argument(
        "--limit", type=int, default=None, metavar="N",
        help="Process at most N stations (for testing)",
    )
    p.add_argument(
        "--force", action="store_true",
        help="Re-fetch all stations, ignoring existing cache",
    )
    p.add_argument(
        "--concurrency", type=int, default=5, metavar="N",
        help="Parallel HTTP workers for MHL station fetches",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()

    # Load station list
    print(f"Loading stations from: {args.input}")
    raw = json.loads(args.input.read_text(encoding="utf-8"))
    all_stations: list[dict] = raw.get("stations", [])
    if not all_stations:
        print("ERROR: No stations found in input file.", file=sys.stderr)
        return 1

    # Apply --limit
    if args.limit is not None:
        all_stations = all_stations[: args.limit]

    mhl_count = sum(1 for s in all_stations if s.get("source") == "mhl")
    bom_count  = sum(1 for s in all_stations if s.get("source") == "bom")
    print(f"Total stations: {len(all_stations)}  (MHL: {mhl_count}, BOM: {bom_count})")

    # Load BOM IFD cache (static JS file)
    print(f"Parsing BOM IFD cache: {BOM_IFD_JS}")
    bom_cache = load_bom_ifd_cache(BOM_IFD_JS)
    print(f"  {len(bom_cache)} BOM IFD keys loaded")

    # Load resume cache
    resume_ifd:    dict = {} if args.force else load_json_safe(CACHE_FILE)
    resume_errors: dict = {} if args.force else load_json_safe(ERROR_FILE)
    already_cached = len([s for s in all_stations if s["station_id"] in resume_ifd or s["station_id"] in resume_errors])
    print(f"Already cached: {already_cached}  (--force={'yes' if args.force else 'no'})")

    # Split into pending / done
    pending = [
        s for s in all_stations
        if args.force or (s["station_id"] not in resume_ifd and s["station_id"] not in resume_errors)
    ]
    print(f"Stations to enrich: {len(pending)}\n")

    ifd_results    = dict(resume_ifd)
    error_results  = dict(resume_errors)

    enriched_now = 0
    failed_now   = 0
    save_interval = 20   # persist cache every N stations

    def _process(station: dict) -> tuple[str, dict | None, str | None]:
        return enrich_station(station, bom_cache)

    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        futures = {pool.submit(_process, s): s for s in pending}
        done_count = 0
        for future in as_completed(futures):
            done_count += 1
            station = futures[future]
            sid = station["station_id"]
            src = station.get("source", "?")
            name = station.get("station_name", sid)
            try:
                _, ifd, err = future.result()
            except Exception as exc:
                err = str(exc)
                ifd = None

            if ifd is not None:
                ifd_results[sid] = ifd
                enriched_now += 1
                status = "OK"
            else:
                error_results[sid] = err or "unknown error"
                failed_now += 1
                status = f"FAIL: {err}"

            # Progress line
            total = len(pending)
            pct = done_count / total * 100
            print(f"  [{done_count:>{len(str(total))}}/{total}  {pct:5.1f}%] [{src}] {name[:40]:<40}  {status}")

            # Periodic cache save
            if done_count % save_interval == 0 or done_count == total:
                save_json(CACHE_FILE, ifd_results)
                save_json(ERROR_FILE, error_results)

    # Final summary
    print()
    total_enriched = len(ifd_results)
    total_errors   = len(error_results)
    print(f"Done.")
    print(f"  Total stations input  : {len(all_stations)}")
    print(f"  Previously cached     : {already_cached}")
    print(f"  Enriched this run     : {enriched_now}")
    print(f"  Failed this run       : {failed_now}")
    print(f"  Total enriched (all)  : {total_enriched}")
    print(f"  Total errors (all)    : {total_errors}")

    # Assemble output
    stations_out: dict = {}
    for s in all_stations:
        sid = s["station_id"]
        stations_out[sid] = {
            "station_id":       sid,
            "station_name":     s.get("station_name", ""),
            "source":           s.get("source", ""),
            "lat":              s.get("lat"),
            "lon":              s.get("lon"),
            "data_identifier":  s.get("data_identifier", ""),
            "activity_status":  s.get("activity_status"),
            "ifd":              ifd_results.get(sid),
        }

    output_payload = {
        "generated_at":         datetime.now(timezone.utc).isoformat(),
        "source_input":         str(args.input),
        "station_count_input":  len(all_stations),
        "enriched_count":       total_enriched,
        "error_count":          total_errors,
        "stations":             stations_out,
        "errors":               error_results,
    }

    save_json(args.output, output_payload)
    print(f"\nOutput written: {args.output}")

    # CSV export
    csv_path = args.output.with_suffix(".csv")
    write_csv(csv_path, all_stations, ifd_results)
    if csv_path.exists():
        print(f"CSV written:    {csv_path}")

    # Clean up cache files if full run succeeded
    if args.limit is None and failed_now == 0 and total_errors == 0:
        for f in (CACHE_FILE, ERROR_FILE):
            if f.exists():
                f.unlink()
        print("Resume cache cleared (no errors).")

    return 0 if total_errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
