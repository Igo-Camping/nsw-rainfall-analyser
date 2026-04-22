"""
NSW Rainfall Analyser - FastAPI Backend
=======================================
Run locally:  uvicorn main:app --reload
Deploy to:    Render (free tier)

Endpoints:
  GET /stations                          - All stations from cache
  GET /stations/{station_id}             - Single station detail
  GET /rainfall                          - Fetch & analyse rainfall event
  GET /aep                               - Calculate AEP for a depth/duration
  GET /temperature                       - Current temperature via Open-Meteo
  GET /health                            - Health check
"""

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import json
import math
import asyncio
import re
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
import httpx

app = FastAPI(
    title="NSW Rainfall Analyser API",
    description="Rainfall AEP analysis using MHL gauge data and BoM IFD tables",
    version="1.0.0"
)

# Allow requests from web frontend and mobile app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    return response

# ---------------------------------------------------------------------------
# Load station cache on startup
# ---------------------------------------------------------------------------

STATION_CACHE_PATH = Path(__file__).parent / "station_cache.json"
_stations: dict = {}   # keyed by station_id


def load_station_cache():
    global _stations
    if not STATION_CACHE_PATH.exists():
        print(f"WARNING: station_cache.json not found at {STATION_CACHE_PATH}")
        return

    with open(STATION_CACHE_PATH, encoding="utf-8") as f:
        station_list = json.load(f)

    _stations = {s["station_id"]: s for s in station_list}
    print(f"Loaded {len(_stations)} stations from cache")


load_station_cache()

# ---------------------------------------------------------------------------
# MHL KiWIS API
# ---------------------------------------------------------------------------

MHL_BASE = "https://wiski.mhl.nsw.gov.au/KiWIS/KiWIS"
BOM_OBS_XML = "http://www.bom.gov.au/fwo/IDN60920.xml"
BOM_HISTORY_JSON = "http://www.bom.gov.au/fwo/IDN60801/IDN60801.{wmo}.json"
BOM_CDO_DAILY_URL = "http://www.bom.gov.au/jsp/ncc/cdio/weatherData/av"
BOM_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json, application/xml, text/xml, text/html, */*",
}
try:
    SYDNEY_TZ = ZoneInfo("Australia/Sydney")
except ZoneInfoNotFoundError:
    SYDNEY_TZ = timezone(timedelta(hours=10))
_bom_station_map: dict = {}
_bom_station_map_loaded_at: Optional[datetime] = None


async def fetch_mhl_timeseries(
    ts_id: str,
    from_dt: datetime,
    to_dt: datetime
) -> list[dict]:
    """
    Fetch 5-minute rainfall timeseries from MHL KiWIS.
    Returns list of { "timestamp": ISO string, "value": float mm }
    """
    params = {
        "service":    "kisters",
        "type":       "queryServices",
        "request":    "getTimeseriesValues",
        "ts_id":      ts_id,
        "from":       from_dt.strftime("%Y-%m-%dT%H:%M:%S"),
        "to":         to_dt.strftime("%Y-%m-%dT%H:%M:%S"),
        "format":     "json",
        "returnfields": "Timestamp,Value"
    }

    timeout = httpx.Timeout(60.0, connect=30.0)

    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.get(MHL_BASE, params=params)
                resp.raise_for_status()
                data = resp.json()
                break
        except (httpx.ConnectTimeout, httpx.ReadTimeout) as e:
            if attempt == 2:
                raise HTTPException(status_code=504,
                    detail=f"MHL API timeout after 3 attempts: {str(e)}")
            await asyncio.sleep(2)
        except Exception as e:
            raise HTTPException(status_code=502,
                detail=f"MHL API error: {str(e)}")

    if not data or len(data) < 2:
        return []

    ts_data = data[0]
    raw_data = ts_data.get("data", [])

    readings = []
    for row in raw_data:
        if len(row) < 2:
            continue
        try:
            ts_str = row[0]
            val    = float(row[1]) if row[1] not in (None, "", "--") else 0.0
            if val < 0:
                val = 0.0
            readings.append({"timestamp": ts_str, "value": val})
        except (ValueError, TypeError):
            continue

    return readings


# ---------------------------------------------------------------------------
# BoM observation fallback
# ---------------------------------------------------------------------------

def normalise_bom_id(value: str) -> str:
    """BoM CDO station numbers are six digits, often stored locally without the leading zero."""
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    return digits.zfill(6) if digits else ""


def parse_bom_time(value: str) -> datetime:
    return datetime.strptime(value, "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)


class CdoDailyTableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows: list[list[str]] = []
        self.station_title = ""
        self._in_data_table = False
        self._table_depth = 0
        self._in_row = False
        self._current_row: list[str] = []
        self._current_cell: Optional[list[str]] = None
        self._capture_heading = False
        self._heading_parts: list[str] = []

    def handle_starttag(self, tag, attrs):
        attr_map = dict(attrs)
        if tag == "table" and attr_map.get("id") == "dataTable":
            self._in_data_table = True
            self._table_depth = 1
        elif self._in_data_table and tag == "table":
            self._table_depth += 1

        if tag in ("h1", "h2"):
            self._capture_heading = True
            self._heading_parts = []

        if self._in_data_table and tag == "tr":
            self._in_row = True
            self._current_row = []
        elif self._in_data_table and self._in_row and tag in ("th", "td"):
            self._current_cell = []

    def handle_data(self, data):
        if self._capture_heading:
            self._heading_parts.append(data)
        if self._current_cell is not None:
            self._current_cell.append(data)

    def handle_endtag(self, tag):
        if tag in ("h1", "h2") and self._capture_heading:
            heading = " ".join(part.strip() for part in self._heading_parts if part.strip())
            if "Daily Rainfall" in heading:
                self.station_title = heading
            self._capture_heading = False
            self._heading_parts = []

        if self._in_data_table and self._in_row and tag in ("th", "td"):
            value = " ".join(part.strip() for part in (self._current_cell or []) if part.strip())
            self._current_row.append(value)
            self._current_cell = None
        elif self._in_data_table and tag == "tr":
            if self._current_row:
                self.rows.append(self._current_row)
            self._in_row = False
            self._current_row = []
        elif self._in_data_table and tag == "table":
            self._table_depth -= 1
            if self._table_depth <= 0:
                self._in_data_table = False


def parse_cdo_day_label(value: str) -> Optional[int]:
    match = re.match(r"\s*(\d{1,2})", value or "")
    return int(match.group(1)) if match else None


def parse_cdo_rain_value(value: str) -> Optional[float]:
    clean = (value or "").replace("\xa0", " ").strip()
    if not clean or clean in ("-", "--"):
        return None
    if clean.upper().startswith("T"):
        return 0.0
    match = re.search(r"-?\d+(?:\.\d+)?", clean)
    return max(0.0, float(match.group(0))) if match else None


async def load_bom_station_map(force: bool = False) -> dict:
    global _bom_station_map, _bom_station_map_loaded_at
    now = datetime.now(timezone.utc)
    if (
        not force
        and _bom_station_map
        and _bom_station_map_loaded_at
        and now - _bom_station_map_loaded_at < timedelta(hours=6)
    ):
        return _bom_station_map

    timeout = httpx.Timeout(30.0, connect=15.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers=BOM_HEADERS) as client:
        resp = await client.get(BOM_OBS_XML)
        resp.raise_for_status()

    root = ET.fromstring(resp.text)
    mapping = {}
    for station in root.findall(".//station"):
        bom_id = normalise_bom_id(station.attrib.get("bom-id", ""))
        wmo_id = str(station.attrib.get("wmo-id", "")).strip()
        if not bom_id or not wmo_id:
            continue
        mapping[bom_id] = {
            "bom_id": bom_id,
            "wmo": wmo_id,
            "name": station.attrib.get("stn-name", ""),
            "lat": station.attrib.get("lat"),
            "lon": station.attrib.get("lon"),
        }

    _bom_station_map = mapping
    _bom_station_map_loaded_at = now
    return _bom_station_map


async def resolve_bom_wmo(bom_id: Optional[str] = None, wmo: Optional[str] = None) -> dict:
    if wmo:
        return {"bom_id": normalise_bom_id(bom_id or ""), "wmo": str(wmo).strip()}
    clean_bom_id = normalise_bom_id(bom_id or "")
    if not clean_bom_id:
        raise HTTPException(status_code=400, detail="BoM station number or WMO ID is required")
    mapping = await load_bom_station_map()
    station = mapping.get(clean_bom_id)
    if not station:
        raise HTTPException(
            status_code=404,
            detail="BoM station is not in the current NSW AWS observation feed",
        )
    return station


async def fetch_bom_observation_readings(
    bom_id: Optional[str],
    wmo: Optional[str],
    from_dt: datetime,
    to_dt: datetime,
) -> dict:
    station = await resolve_bom_wmo(bom_id=bom_id, wmo=wmo)
    timeout = httpx.Timeout(30.0, connect=15.0)
    url = BOM_HISTORY_JSON.format(wmo=station["wmo"])

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers=BOM_HEADERS) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        payload = resp.json()

    rows = payload.get("observations", {}).get("data", [])
    parsed = []
    for row in rows:
        utc_raw = str(row.get("aifstime_utc") or "")
        rain_raw = row.get("rain_trace")
        if not utc_raw or rain_raw in (None, "-", ""):
            continue
        try:
            timestamp = parse_bom_time(utc_raw)
            rain_total = float(str(rain_raw).replace("T", "0"))
        except ValueError:
            continue
        parsed.append((timestamp, max(0.0, rain_total)))

    parsed.sort(key=lambda item: item[0])
    readings = []
    previous_total = None
    previous_rain_day = None

    for timestamp, rain_total in parsed:
        local_time = timestamp + timedelta(hours=10)
        rain_day = local_time.date()
        if local_time.hour < 9:
            rain_day = (local_time - timedelta(days=1)).date()

        if previous_total is None:
            increment = 0.0
        elif rain_day != previous_rain_day or rain_total < previous_total:
            increment = rain_total
        else:
            increment = rain_total - previous_total

        previous_total = rain_total
        previous_rain_day = rain_day

        if from_dt <= timestamp <= to_dt:
            readings.append({
                "timestamp": timestamp.isoformat().replace("+00:00", "Z"),
                "value": round(max(0.0, increment), 2),
            })

    return {
        "station": station,
        "readings": readings,
        "source": "BoM 72-hour AWS observations",
        "resolution_minutes": 30,
    }


async def fetch_bom_cdo_daily_readings(
    bom_id: Optional[str],
    from_dt: datetime,
    to_dt: datetime,
) -> dict:
    clean_bom_id = normalise_bom_id(bom_id or "")
    if not clean_bom_id:
        raise HTTPException(status_code=400, detail="BoM station number is required for CDO daily rainfall")

    params = {
        "p_nccObsCode": "136",
        "p_display_type": "dailyDataFile",
        "p_startYear": "",
        "p_c": "",
        "p_stn_num": clean_bom_id,
    }
    timeout = httpx.Timeout(30.0, connect=15.0)

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers=BOM_HEADERS) as client:
        resp = await client.get(BOM_CDO_DAILY_URL, params=params)
        resp.raise_for_status()

    if "Weather Data temporarily unavailable" in resp.text:
        raise HTTPException(status_code=503, detail="BoM CDO daily rainfall is temporarily unavailable")

    parser = CdoDailyTableParser()
    parser.feed(resp.text)
    if not parser.rows:
        raise HTTPException(status_code=404, detail="No BoM CDO daily rainfall table found for this station")

    year = None
    readings = []
    for row in parser.rows:
        if not row:
            continue

        if re.fullmatch(r"\d{4}", row[0] or ""):
            year = int(row[0])
            continue

        day = parse_cdo_day_label(row[0])
        if not year or not day:
            continue

        for month, raw_value in enumerate(row[1:13], start=1):
            rain = parse_cdo_rain_value(raw_value)
            if rain is None:
                continue
            try:
                local_time = datetime(year, month, day, 9, 0, tzinfo=SYDNEY_TZ)
            except ValueError:
                continue

            timestamp = local_time.astimezone(timezone.utc)
            if from_dt <= timestamp <= to_dt:
                readings.append({
                    "timestamp": local_time.isoformat(),
                    "value": round(rain, 2),
                })

    readings.sort(key=lambda item: item["timestamp"])
    station_name = parser.station_title
    if station_name:
        station_name = re.sub(r"^\s*Daily Rainfall\s*-\s*", "", station_name).strip()

    return {
        "station": {
            "bom_id": clean_bom_id,
            "wmo": None,
            "name": station_name or f"BoM station {clean_bom_id}",
            "lat": None,
            "lon": None,
        },
        "readings": readings,
        "source": "BoM Climate Data Online daily rainfall",
        "resolution_minutes": 1440,
    }


# ---------------------------------------------------------------------------
# Rolling max calculation
# ---------------------------------------------------------------------------

def calculate_rolling_max(
    readings: list[dict],
    duration_minutes: int,
    interval_minutes: int = 5
) -> dict:
    """
    Calculate the maximum rolling depth over a given duration.

    Returns:
    {
        "max_depth_mm": float,
        "peak_start":   ISO timestamp,
        "peak_end":     ISO timestamp,
        "total_depth_mm": float,
        "reading_count": int
    }
    """
    if not readings:
        return None

    # Number of source intervals in the requested duration.
    intervals = round(duration_minutes / max(1, interval_minutes))
    if intervals < 1:
        intervals = 1

    values = [r["value"] for r in readings]
    timestamps = [r["timestamp"] for r in readings]

    max_depth   = 0.0
    peak_start  = None
    peak_end    = None

    for i in range(len(values) - intervals + 1):
        window_sum = sum(values[i:i + intervals])
        if window_sum > max_depth:
            max_depth  = window_sum
            peak_start = timestamps[i]
            peak_end   = timestamps[i + intervals - 1]

    total_depth = sum(values)

    return {
        "max_depth_mm":   round(max_depth, 2),
        "peak_start":     peak_start,
        "peak_end":       peak_end,
        "total_depth_mm": round(total_depth, 2),
        "reading_count":  len(readings)
    }


# ---------------------------------------------------------------------------
# AEP calculation
# ---------------------------------------------------------------------------

def calculate_aep(
    station: dict,
    duration_minutes: int,
    depth_mm: float
) -> dict:
    """
    Compare a rainfall depth against the station's IFD table.
    Returns AEP bracket and interpolated estimate.

    IFD structure: { duration_min: { "AEP%": depth_mm } }
    """
    ifd = station.get("ifd")
    if not ifd:
        raise HTTPException(status_code=404,
                            detail="No IFD data for this station")

    # Find closest available duration in IFD table
    dur_key = str(duration_minutes)
    available_durs = {int(k): k for k in ifd.keys()}

    if duration_minutes in available_durs:
        ifd_row = ifd[dur_key]
    else:
        # Find nearest duration
        nearest = min(available_durs.keys(),
                      key=lambda d: abs(d - duration_minutes))
        ifd_row = ifd[str(nearest)]
        dur_key = str(nearest)

    # Standard AEP order (most frequent to rarest)
    aep_order = ["63.2%", "50%", "20%", "10%", "5%", "2%", "1%"]
    available_aeps = [a for a in aep_order if a in ifd_row]

    if not available_aeps:
        raise HTTPException(status_code=500,
                            detail="IFD table has no recognisable AEP columns")

    # Find which bracket the depth falls into
    bracket_lower = None
    bracket_upper = None
    aep_result    = None

    depths = [(aep, ifd_row[aep]) for aep in available_aeps]

    # Check if below all thresholds (very frequent, < 63.2% AEP)
    if depth_mm < depths[0][1]:
        aep_result = f"> {depths[0][0]}"
        bracket_lower = None
        bracket_upper = depths[0][0]

    # Check if above all thresholds (rarer than 1% AEP)
    elif depth_mm >= depths[-1][1]:
        aep_result = f"< {depths[-1][0]}"
        bracket_lower = depths[-1][0]
        bracket_upper = None

    else:
        # Find bracket and interpolate
        for i in range(len(depths) - 1):
            aep_lo, depth_lo = depths[i]
            aep_hi, depth_hi = depths[i + 1]

            if depth_lo <= depth_mm < depth_hi:
                bracket_lower = aep_lo
                bracket_upper = aep_hi

                # Log-linear interpolation between AEP values
                # Convert AEP% to numeric
                p_lo = float(aep_lo.replace("%", ""))
                p_hi = float(aep_hi.replace("%", ""))

                if depth_hi > depth_lo:
                    frac = (depth_mm - depth_lo) / (depth_hi - depth_lo)
                    # Interpolate in log space for AEP
                    log_p = math.log(p_lo) + frac * (math.log(p_hi) - math.log(p_lo))
                    interp_aep = round(math.exp(log_p), 1)
                    aep_result = f"~{interp_aep}%"
                else:
                    aep_result = f"~{aep_lo}"
                break

    # Build reference table for this duration
    reference = {aep: ifd_row[aep] for aep in available_aeps}

    return {
        "duration_minutes":  int(dur_key),
        "depth_mm":          round(depth_mm, 2),
        "aep":               aep_result,
        "bracket_lower_aep": bracket_lower,
        "bracket_upper_aep": bracket_upper,
        "ifd_reference":     reference,
        "interpretation":    build_interpretation(aep_result)
    }


def build_interpretation(aep: str) -> str:
    """Human-readable interpretation of AEP result."""
    if not aep:
        return "Unable to determine rarity"

    clean = aep.replace("~", "").replace(">", "").replace("<", "").strip()
    try:
        pct = float(clean.replace("%", ""))
    except ValueError:
        return aep

    if pct >= 63.2:
        return "Very frequent event (less than 2-year ARI)"
    elif pct >= 50:
        return "Frequent event (~2-year ARI)"
    elif pct >= 20:
        return "Moderate event (~5-year ARI)"
    elif pct >= 10:
        return "Significant event (~10-year ARI)"
    elif pct >= 5:
        return "Rare event (~20-year ARI)"
    elif pct >= 2:
        return "Very rare event (~50-year ARI)"
    elif pct >= 1:
        return "Extreme event (~100-year ARI)"
    else:
        return "Extreme event (greater than 1-in-100 year ARI)"


# ---------------------------------------------------------------------------
# Open-Meteo temperature
# ---------------------------------------------------------------------------

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


async def fetch_temperature(lat: float, lon: float) -> dict:
    """
    Fetch current temperature and recent hourly data from Open-Meteo.
    Free, no API key required.
    """
    params = {
        "latitude":        lat,
        "longitude":       lon,
        "current":         "temperature_2m,relative_humidity_2m,weather_code",
        "hourly":          "temperature_2m",
        "timezone":        "Australia/Sydney",
        "forecast_days":   1,
    }

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(OPEN_METEO_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    current = data.get("current", {})
    return {
        "temperature_c":    current.get("temperature_2m"),
        "humidity_pct":     current.get("relative_humidity_2m"),
        "weather_code":     current.get("weather_code"),
        "observed_at":      current.get("time"),
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {
        "status":         "ok",
        "stations_loaded": len(_stations),
        "timestamp":      datetime.utcnow().isoformat()
    }


@app.get("/stations")
def get_stations(
    search: Optional[str] = Query(None, description="Filter by name"),
    lat:    Optional[float] = Query(None, description="Centre lat for nearest search"),
    lon:    Optional[float] = Query(None, description="Centre lon for nearest search"),
    limit:  int = Query(50, description="Max results")
):
    """
    Return list of stations.
    Optionally filter by name or sort by distance from a lat/lon.
    """
    stations = list(_stations.values())

    # Filter by name search
    if search:
        q = search.lower()
        stations = [s for s in stations if q in s["name"].lower()]

    # Sort by distance from point
    if lat is not None and lon is not None:
        def dist(s):
            return math.sqrt((s["lat"] - lat)**2 + (s["lon"] - lon)**2)
        stations = sorted(stations, key=dist)

    # Strip IFD from list response (too much data)
    result = []
    for s in stations[:limit]:
        result.append({
            "station_id": s["station_id"],
            "station_no": s["station_no"],
            "name":       s["name"],
            "lat":        s["lat"],
            "lon":        s["lon"],
            "ts_id":      s["ts_id"],
            "has_ifd":    s.get("ifd") is not None,
            "lga":        s.get("lga", "Unknown"),
            "active":     s.get("active", True)
        })

    return {"count": len(result), "stations": result}


@app.get("/stations/{station_id}")
def get_station(station_id: str):
    """Return full station detail including IFD table."""
    s = _stations.get(station_id)
    if not s:
        raise HTTPException(status_code=404, detail="Station not found")
    return s


@app.get("/rainfall")
async def get_rainfall(
    station_id:       str   = Query(..., description="MHL station ID"),
    duration_minutes: int   = Query(..., description="Analysis duration in minutes (e.g. 30, 60, 360)"),
    hours_back:       Optional[int]   = Query(None, description="Hours to look back from now"),
    from_dt:          Optional[str]   = Query(None, description="Start datetime (ISO format, e.g. 2024-01-15T06:00:00)"),
    to_dt:            Optional[str]   = Query(None, description="End datetime (ISO format)"),
    calculate_aep_flag: bool = Query(True, alias="aep", description="Include AEP calculation")
):
    """
    Fetch rainfall data for a station and calculate rolling maximum depth.
    Optionally includes AEP classification.

    Either provide hours_back (for recent events) or from_dt + to_dt (for historical).
    """
    station = _stations.get(station_id)
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")

    ts_id = station.get("ts_id")
    if not ts_id:
        raise HTTPException(status_code=400,
                            detail="Station has no rainfall timeseries ID")

    # Resolve time window
    now = datetime.now(timezone.utc)

    if from_dt and to_dt:
        try:
            start = datetime.fromisoformat(from_dt.replace("Z", "+00:00"))
            end   = datetime.fromisoformat(to_dt.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400,
                                detail="Invalid datetime format. Use ISO 8601.")
    elif hours_back:
        if hours_back > 720:
            raise HTTPException(status_code=400,
                                detail="Maximum lookback is 720 hours (30 days)")
        end   = now
        start = now - timedelta(hours=hours_back)
    else:
        # Default: last 24 hours
        end   = now
        start = now - timedelta(hours=24)

    # Fetch timeseries data
    readings = await fetch_mhl_timeseries(ts_id, start, end)

    if not readings:
        return {
            "station_id":   station_id,
            "station_name": station["name"],
            "from":         start.isoformat(),
            "to":           end.isoformat(),
            "duration_minutes": duration_minutes,
            "readings_count": 0,
            "rolling_max":  None,
            "aep":          None,
            "message":      "No data returned for this period"
        }

    # Calculate rolling maximum
    rolling = calculate_rolling_max(readings, duration_minutes)

    # Calculate AEP if requested and IFD data available
    aep_result = None
    if calculate_aep_flag and rolling and rolling["max_depth_mm"] > 0:
        if station.get("ifd"):
            aep_result = calculate_aep(
                station,
                duration_minutes,
                rolling["max_depth_mm"]
            )

    return {
        "station_id":       station_id,
        "station_name":     station["name"],
        "lat":              station["lat"],
        "lon":              station["lon"],
        "from":             start.isoformat(),
        "to":               end.isoformat(),
        "duration_minutes": duration_minutes,
        "readings":         readings,
        "rolling_max":      rolling,
        "aep":              aep_result,
    }


@app.get("/bom/rainfall")
async def get_bom_rainfall(
    bom_id: Optional[str] = Query(None, description="Six digit BoM station number"),
    wmo: Optional[str] = Query(None, description="Five digit WMO station number"),
    duration_minutes: int = Query(..., description="Analysis duration in minutes"),
    from_dt: str = Query(..., description="Start datetime (ISO format)"),
    to_dt: str = Query(..., description="End datetime (ISO format)"),
):
    """
    Fallback rainfall source for non-MHL BoM AWS stations.
    Uses BoM 72-hour observations and converts cumulative rain_trace values
    into interval rainfall readings.
    """
    try:
        start = datetime.fromisoformat(from_dt.replace("Z", "+00:00"))
        end = datetime.fromisoformat(to_dt.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid datetime format. Use ISO 8601.")

    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    start = start.astimezone(timezone.utc)
    end = end.astimezone(timezone.utc)

    if end <= start:
        raise HTTPException(status_code=400, detail="End datetime must be after start datetime")

    try:
        if end - start <= timedelta(hours=72):
            bom_data = await fetch_bom_observation_readings(bom_id, wmo, start, end)
        else:
            bom_data = await fetch_bom_cdo_daily_readings(bom_id, start, end)

        if not bom_data["readings"] and bom_id:
            cdo_data = await fetch_bom_cdo_daily_readings(bom_id, start, end)
            if cdo_data["readings"]:
                bom_data = cdo_data
    except HTTPException as exc:
        if exc.status_code == 404 and bom_id:
            bom_data = await fetch_bom_cdo_daily_readings(bom_id, start, end)
        else:
            raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"BoM rainfall fetch failed: {str(e)}")

    readings = bom_data["readings"]
    resolution_minutes = bom_data["resolution_minutes"]
    rolling = calculate_rolling_max(
        readings,
        duration_minutes,
        resolution_minutes,
    ) if readings and duration_minutes >= resolution_minutes and duration_minutes % resolution_minutes == 0 else None
    station = bom_data["station"]

    return {
        "station_id": station.get("bom_id") or station.get("wmo"),
        "station_name": station.get("name") or "BoM station",
        "bom_id": station.get("bom_id"),
        "wmo": station.get("wmo"),
        "from": start.isoformat(),
        "to": end.isoformat(),
        "duration_minutes": duration_minutes,
        "readings": readings,
        "rolling_max": rolling,
        "aep": None,
        "source": bom_data["source"],
        "resolution_minutes": resolution_minutes,
    }


@app.get("/aep")
def get_aep(
    station_id:       str   = Query(..., description="MHL station ID"),
    duration_minutes: int   = Query(..., description="Duration in minutes"),
    depth_mm:         float = Query(..., description="Observed depth in mm")
):
    """
    Calculate AEP for a known depth and duration at a station.
    Useful for manual entry or re-analysis.
    """
    station = _stations.get(station_id)
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")

    return calculate_aep(station, duration_minutes, depth_mm)


@app.get("/temperature")
async def get_temperature(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude")
):
    """
    Get current temperature and humidity from Open-Meteo.
    Uses station coordinates — no API key needed.
    """
    try:
        return await fetch_temperature(lat, lon)
    except Exception as e:
        raise HTTPException(status_code=502,
                            detail=f"Temperature fetch failed: {str(e)}")


@app.get("/analyse")
async def analyse(
    station_id:       str          = Query(...),
    duration_minutes: int          = Query(...),
    hours_back:       Optional[int] = Query(None),
    from_dt:          Optional[str] = Query(None),
    to_dt:            Optional[str] = Query(None),
):
    """
    Combined endpoint: rainfall + AEP + temperature in one call.
    Reduces round trips for mobile clients.
    """
    # Get rainfall + AEP
    rainfall_data = await get_rainfall(
        station_id=station_id,
        duration_minutes=duration_minutes,
        hours_back=hours_back,
        from_dt=from_dt,
        to_dt=to_dt,
        calculate_aep_flag=True
    )

    # Get temperature using station coordinates
    station = _stations.get(station_id)
    temp_data = None
    if station:
        try:
            temp_data = await fetch_temperature(station["lat"], station["lon"])
        except Exception:
            pass

    return {
        **rainfall_data,
        "temperature": temp_data
    }
