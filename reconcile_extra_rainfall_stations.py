"""
Compare the current MHL-backed station cache with NSW's broader rainfall dataset
to identify likely extra rainfall stations worth investigating.

Outputs:
  - rainfall_reconciliation_summary.json
  - rainfall_missing_candidates.csv

Run with:
  py reconcile_extra_rainfall_stations.py
"""

from __future__ import annotations

import csv
import json
import math
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests


ROOT = Path(r"D:\Weather App Folder")
STATION_CACHE_PATH = ROOT / "station_cache.json"
SUMMARY_PATH = ROOT / "rainfall_reconciliation_summary.json"
CANDIDATES_CSV_PATH = ROOT / "rainfall_missing_candidates.csv"
CURATED_CSV_PATH = ROOT / "rainfall_missing_candidates_curated.csv"
CURATED_JSON_PATH = ROOT / "rainfall_missing_candidates_curated.json"

NSW_RAINFALL_JSON_URL = (
    "https://datasets.seed.nsw.gov.au/dataset/"
    "47bb96b8-c7cb-4604-a594-c2dde2bbd44a/resource/"
    "f4cd1d27-517b-408d-b425-3dd5520fa143/download/rainfall.json"
)

RECENT_DAYS = 365
COORD_MATCH_KM = 0.35
FUTURE_TOLERANCE_DAYS = 1

OBVIOUS_EXCLUDE_PATTERNS = [
    r"\briver\b",
    r"\bcreek\b",
    r"\bcanal\b",
    r"\bdrain(age)?\b",
    r"\bbore\b",
    r"\bchannel\b",
    r"\bregulator\b",
    r"\bjunction\b",
    r"\bbridge\b",
    r"\bsite\s*\d+\b",
    r"\bsite no\b",
    r"\bcomposite\b",
    r"\bpluviograph\b",
    r"\bmain canal\b",
    r"\bdc\b",
    r"\bat\b",
    r"@",
]


def load_station_cache() -> list[dict]:
    with open(STATION_CACHE_PATH, encoding="utf-8") as f:
        return json.load(f)


def fetch_nsw_rainfall_dataset() -> list[dict]:
    resp = requests.get(
        NSW_RAINFALL_JSON_URL,
        timeout=60,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/135.0 Safari/537.36"
            )
        },
    )
    resp.raise_for_status()
    payload = resp.json()
    return payload.get("features", [])


def normalize_name(value: str) -> str:
    text = (value or "").strip().lower()
    text = text.replace("&", " and ")
    text = re.sub(r"\baws\b", " ", text)
    text = re.sub(r"\brainfall\b", " rain ", text)
    text = re.sub(r"\brain\b", " rain ", text)
    text = re.sub(r"\bairport\b", " airport ", text)
    text = re.sub(r"\(.*?\)", " ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def parse_iso_dt(value: str) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def km_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    )
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def build_indexes(stations: list[dict]) -> tuple[set[str], dict[str, list[dict]]]:
    station_nos = {str(s.get("station_no", "")).strip() for s in stations if s.get("station_no")}
    names: dict[str, list[dict]] = {}
    for station in stations:
        key = normalize_name(station.get("name", ""))
        if not key:
            continue
        names.setdefault(key, []).append(station)
    return station_nos, names


def classify_feature(
    feature: dict,
    station_nos: set[str],
    names_index: dict[str, list[dict]],
    now: datetime,
) -> dict:
    props = feature.get("properties", {})
    geom = feature.get("geometry", {})
    coords = geom.get("coordinates", [None, None])
    lon = coords[0]
    lat = coords[1]
    station_no = str(props.get("station_no", "")).strip()
    name = (props.get("station_longname") or "").strip()
    norm_name = normalize_name(name)
    end_dt = parse_iso_dt(props.get("to", ""))
    days_since = None if not end_dt else round((now - end_dt.astimezone(timezone.utc)).total_seconds() / 86400, 1)

    if station_no and station_no in station_nos:
        return {
            "status": "existing_station_no",
            "station_no": station_no,
            "station_name": name,
            "days_since_last_data": days_since,
        }

    if norm_name and norm_name in names_index:
        return {
            "status": "existing_name",
            "station_no": station_no,
            "station_name": name,
            "days_since_last_data": days_since,
        }

    if lat is not None and lon is not None:
        for existing_list in names_index.values():
            for station in existing_list:
                dist_km = km_distance(lat, lon, station["lat"], station["lon"])
                if dist_km <= COORD_MATCH_KM:
                    return {
                        "status": "existing_nearby",
                        "station_no": station_no,
                        "station_name": name,
                        "days_since_last_data": days_since,
                        "nearby_station_id": station.get("station_id"),
                        "nearby_station_name": station.get("name"),
                        "distance_km": round(dist_km, 3),
                    }

    is_recent = days_since is not None and days_since <= RECENT_DAYS
    return {
        "status": "candidate_recent" if is_recent else "candidate_stale",
        "station_no": station_no,
        "station_name": name,
        "lat": lat,
        "lon": lon,
        "days_since_last_data": days_since,
        "last_data_at": props.get("to", ""),
        "first_data_at": props.get("from", ""),
        "data_owner": props.get("DATA_OWNER_NAME", ""),
    }


def is_curated_candidate(row: dict, now: datetime) -> bool:
    if row.get("status") != "candidate_recent":
        return False

    owner = (row.get("data_owner") or "").strip()
    if owner.startswith("ACT -") or owner.startswith("VIC -"):
        return False

    end_dt = parse_iso_dt(row.get("last_data_at", ""))
    if end_dt and end_dt > now + timedelta(days=FUTURE_TOLERANCE_DAYS):
        return False

    name = (row.get("station_name") or "").strip().lower()
    if any(re.search(pattern, name) for pattern in OBVIOUS_EXCLUDE_PATTERNS):
        return False

    return True


def main() -> None:
    now = datetime.now(timezone.utc)
    existing = load_station_cache()
    features = fetch_nsw_rainfall_dataset()
    station_nos, names_index = build_indexes(existing)

    classified = [classify_feature(feature, station_nos, names_index, now) for feature in features]

    counts: dict[str, int] = {}
    for row in classified:
        counts[row["status"]] = counts.get(row["status"], 0) + 1

    candidates = [
        row for row in classified
        if row["status"] in {"candidate_recent", "candidate_stale"}
    ]
    candidates.sort(
        key=lambda row: (
            0 if row["status"] == "candidate_recent" else 1,
            row["days_since_last_data"] if row["days_since_last_data"] is not None else 999999,
            row["station_name"],
        )
    )

    curated = [row for row in candidates if is_curated_candidate(row, now)]

    summary = {
        "generated_at": now.isoformat(),
        "existing_station_cache_count": len(existing),
        "nsw_rainfall_feature_count": len(features),
        "classification_counts": counts,
        "recent_candidate_count": counts.get("candidate_recent", 0),
        "stale_candidate_count": counts.get("candidate_stale", 0),
        "curated_candidate_count": len(curated),
        "top_recent_candidates": candidates[:25],
        "top_curated_candidates": curated[:25],
        "camden_matches": [
            row for row in candidates
            if "camden" in row.get("station_name", "").lower()
        ],
        "camden_curated_matches": [
            row for row in curated
            if "camden" in row.get("station_name", "").lower()
        ],
    }

    with open(SUMMARY_PATH, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    with open(CANDIDATES_CSV_PATH, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "status",
                "station_no",
                "station_name",
                "lat",
                "lon",
                "days_since_last_data",
                "last_data_at",
                "first_data_at",
                "data_owner",
            ],
        )
        writer.writeheader()
        for row in candidates:
            writer.writerow({key: row.get(key, "") for key in writer.fieldnames})

    with open(CURATED_CSV_PATH, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "status",
                "station_no",
                "station_name",
                "lat",
                "lon",
                "days_since_last_data",
                "last_data_at",
                "first_data_at",
                "data_owner",
            ],
        )
        writer.writeheader()
        for row in curated:
            writer.writerow({key: row.get(key, "") for key in writer.fieldnames})

    with open(CURATED_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(curated, f, indent=2)

    print(f"Wrote {SUMMARY_PATH}")
    print(f"Wrote {CANDIDATES_CSV_PATH}")
    print(f"Wrote {CURATED_CSV_PATH}")
    print(f"Wrote {CURATED_JSON_PATH}")
    print(json.dumps(summary["classification_counts"], indent=2))
    print(f"Curated candidates: {len(curated)}")
    if summary["camden_matches"]:
        print("Camden-related candidates:")
        for row in summary["camden_matches"]:
            print(f"  {row['station_no']} | {row['station_name']} | {row['status']}")
    if summary["camden_curated_matches"]:
        print("Camden curated candidates:")
        for row in summary["camden_curated_matches"]:
            print(f"  {row['station_no']} | {row['station_name']}")


if __name__ == "__main__":
    main()
