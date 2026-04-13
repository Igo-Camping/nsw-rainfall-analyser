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
from pathlib import Path
from datetime import datetime, timedelta, timezone
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
# Rolling max calculation
# ---------------------------------------------------------------------------

def calculate_rolling_max(
    readings: list[dict],
    duration_minutes: int
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

    # Number of 5-min intervals in the duration
    intervals = duration_minutes // 5
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
