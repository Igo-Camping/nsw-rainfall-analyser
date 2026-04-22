import json, os, urllib.request, urllib.parse, urllib.error
from datetime import datetime, timezone, timedelta
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
RENDER_INGEST_URL = os.environ.get("RENDER_INGEST_URL", "https://nsw-rainfall-analyser-api.onrender.com/ingest-bom-rainfall")
RENDER_SECRET = os.environ.get("RENDER_SECRET", "nbc-bom-ingest-2024")
BOM_KISTERS = "http://www.bom.gov.au/waterdata/services"
TS_ID_CACHE = SCRIPT_DIR / "bom_ts_ids.json"
LOOKBACK_HOURS = 2

BOM_STATIONS = [
    {"name": "COLLAROY (LONG REEF GOLF CLUB)", "site": "066126", "lat": -33.7407, "lon": 151.2628},
    {"name": "NARRABEEN LAKE (OXFORD FALLS)",  "site": "066133", "lat": -33.6956, "lon": 151.2422},
    {"name": "NARRABEEN LAKE (TERREY HILLS)",  "site": "066197", "lat": -33.6838, "lon": 151.2314},
    {"name": "NORTH NARRABEEN (PITTWATER RD)", "site": "066168", "lat": -33.7078, "lon": 151.2985},
    {"name": "PALM BEACH (BYNYA RD)",          "site": "066160", "lat": -33.6192, "lon": 151.3063},
    {"name": "TERREY HILLS (BOORALIE RD)",     "site": "066198", "lat": -33.6703, "lon": 151.2181},
    {"name": "TERREY HILLS (MONA VALE RD)",    "site": "066135", "lat": -33.6810, "lon": 151.2289},
    {"name": "WHALE BEACH",                    "site": "066048", "lat": -33.5752, "lon": 151.3286},
]

def bom_get(params):
    p = {"service":"kisters","type":"queryServices","format":"json"}
    p.update(params)
    url = BOM_KISTERS + "?" + urllib.parse.urlencode(p)
    try:
        req = urllib.request.Request(url, headers={"User-Agent":"NBC-Rainfall-Poller/1.0"})
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode()) if r.status == 200 else None
    except Exception as e:
        print(f"  BOM fetch error: {e}"); return None

def find_ts_id(site):
    data = bom_get({"request":"getTimeseriesList","station_no":site,"returnfields":"ts_id,ts_name,parametertype_name"})
    if not data or len(data) < 2: return None
    headers, rows = data[0], data[1:]
    try:
        idx_id = headers.index("ts_id"); idx_name = headers.index("ts_name"); idx_type = headers.index("parametertype_name")
    except ValueError: return None
    candidates = [{"ts_id":r[idx_id],"ts_name":r[idx_name]} for r in rows if "rainfall" in str(r[idx_type]).lower() or "rain" in str(r[idx_name]).lower()]
    if not candidates: return None
    for p in ["pat.1","pat.3","cmd.1","raw.1"]:
        for c in candidates:
            if p in str(c["ts_name"]).lower():
                print(f"    Found ts_id={c['ts_id']} ({c['ts_name']})"); return str(c["ts_id"])
    c = candidates[0]; print(f"    Fallback ts_id={c['ts_id']} ({c['ts_name']})"); return str(c["ts_id"])

def load_cache(): return json.loads(TS_ID_CACHE.read_text()) if TS_ID_CACHE.exists() else {}
def save_cache(c): TS_ID_CACHE.write_text(json.dumps(c, indent=2))

def fetch_rainfall(ts_id, from_dt, to_dt):
    fmt = "%Y-%m-%dT%H:%M:%S+00:00"
    data = bom_get({"request":"getTimeseriesValues","ts_id":ts_id,"from":from_dt.strftime(fmt),"to":to_dt.strftime(fmt),"returnfields":"Timestamp,Value"})
    if not data: return []
    readings = []
    try:
        rows = data[0].get("data",{}).get("values",[]) if isinstance(data[0],dict) else data[1:]
        for row in rows:
            if len(row)>=2 and row[1] not in (None,"","--"):
                try: readings.append({"ts":str(row[0]),"value":float(row[1])})
                except: pass
    except Exception as e: print(f"    Parse error: {e}")
    return readings

def post_to_render(payload):
    body = json.dumps(payload).encode()
    req = urllib.request.Request(RENDER_INGEST_URL, data=body, headers={"Content-Type":"application/json","X-Ingest-Secret":RENDER_SECRET}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status == 200
    except Exception as e: print(f"  Render POST failed: {e}"); return False

def main():
    now = datetime.now(timezone.utc)
    from_dt = now - timedelta(hours=LOOKBACK_HOURS)
    print(f"\n{'='*55}\nBOM Poller — {now.strftime('%Y-%m-%d %H:%M UTC')}\n{'='*55}")
    cache = load_cache(); updated = False
    for s in [s for s in BOM_STATIONS if s["site"] not in cache]:
        print(f"  Discovering: {s['name']} ({s['site']})")
        ts_id = find_ts_id(s["site"])
        if ts_id: cache[s["site"]] = ts_id; updated = True
        else: print("    Not found — BOM WDO may still be down")
    if updated: save_cache(cache); print(f"  Cache saved ({len(cache)}/8 found)")
    stations_data, total = [], 0
    for s in BOM_STATIONS:
        if s["site"] not in cache: continue
        ts_id = cache[s["site"]]
        print(f"\n  {s['name']} (ts_id={ts_id})")
        readings = fetch_rainfall(ts_id, from_dt, now)
        if readings: print(f"    {len(readings)} readings"); total += len(readings); stations_data.append({**s,"ts_id":ts_id,"readings":readings})
        else: print("    No data")
    if stations_data:
        print(f"\nPOSTing {total} readings from {len(stations_data)} stations...")
        ok = post_to_render({"fetched_at":now.isoformat(),"from":from_dt.isoformat(),"to":now.isoformat(),"stations":stations_data})
        print("  ✓ Success" if ok else "  ✗ Failed")
    else: print("\nNo data to POST")
    print(f"Done — {now.strftime('%H:%M:%S UTC')}")

if __name__ == "__main__": main()
