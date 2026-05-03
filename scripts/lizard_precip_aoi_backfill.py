#!/usr/bin/env python3
"""
lizard_precip_aoi_backfill.py

Pull AOI-clipped frames of the Lizard "Precipitation Australia" raster
into the Stormgauge radar archive. Read-only, GET-only, paginated /
retry / 429 / timeout aware. Discovers the canonical Lizard data
endpoint at startup BEFORE any bulk fetch begins.

Outputs (under --out-root, default
data/radar_archive/processed/lizard_precipitation_australia/):
  raw_payloads/   <YYYYMMDDTHHMMSSZ>_lizard_precipitation_australia.<ext>
  metadata/       <YYYYMMDDTHHMMSSZ>_lizard_precipitation_australia.json
  logs/           backfill_<run-ts>.log

Status report (appended each run):
  data/radar_archive/reports/lizard_precipitation_australia_backfill_status.md

Auth: env LIZARD_API_TOKEN. Format `username:apikey` -> HTTP Basic
(Lizard standard); otherwise -> Bearer; missing -> anonymous.

CLI:
  --bbox west,south,east,north (default Northern Beaches AOI)
  --start ISO start (inclusive)
  --end   ISO end   (inclusive)
  --limit cap on timesteps processed this run
  --write actually fetch + persist (otherwise dry-run, no /data/ GETs)
  --overwrite re-fetch and replace existing files
  --out-root override default output root
  --report override default report path
  --verbose mirror log lines to stderr

Hard rules:
  - GET only. No POST / PATCH / DELETE.
  - Endpoint is discovered (probed) at startup; if discovery fails the
    script aborts cleanly without bulk-downloading anything.
  - Existing files are preserved unless --overwrite is supplied.
  - Failures are logged and counted; the run never crashes.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import requests
except ImportError:
    print(
        "ERROR: this script requires the 'requests' package "
        "(pip install requests)",
        file=sys.stderr,
    )
    sys.exit(2)


# --- Constants -------------------------------------------------------------

RASTER_UUID = "1b6c03df-2ad1-4f17-89f6-319ea797b357"
RASTERSOURCE_UUID = "3ed06473-4da0-414a-859b-6a54cf59aaba"
BASE_URL = "https://northernbeaches.lizard.net/api/v4"
NAME = "lizard_precipitation_australia"
INTERVAL_HOURS = 3
UNIT = "mm"

# Default AOI: Northern Beaches LGA bounding box (west, south, east, north).
DEFAULT_BBOX = (151.15, -33.85, 151.40, -33.55)

# Lizard /data/ defaults. Native CRS is 4326 for this raster, so we keep
# it native and let downstream tooling reproject to MGA56 if needed.
TARGET_FORMAT = "geotiff"
TARGET_PROJECTION = "EPSG:4326"

USER_AGENT = "Stormgauge-LizardBackfill/0.1 (+pluvio-stormgauge)"
HTTP_TIMEOUT_S = 60
MAX_RETRIES = 5
BACKOFF_BASE_S = 1.5

REPORT_PATH_REL = (
    Path("data") / "radar_archive" / "reports"
    / "lizard_precipitation_australia_backfill_status.md"
)
DEFAULT_OUT_ROOT_REL = (
    Path("data") / "radar_archive" / "processed"
    / "lizard_precipitation_australia"
)


# --- Auth + HTTP -----------------------------------------------------------

def build_auth_headers(token: Optional[str]) -> Tuple[Dict[str, str], str]:
    headers: Dict[str, str] = {"User-Agent": USER_AGENT, "Accept": "*/*"}
    if not token:
        return headers, "anonymous"
    if ":" in token:
        encoded = base64.b64encode(token.encode("utf-8")).decode("ascii")
        headers["Authorization"] = f"Basic {encoded}"
        return headers, "basic(username:apikey)"
    headers["Authorization"] = f"Bearer {token}"
    return headers, "bearer"


def http_get(
    session: requests.Session,
    url: str,
    headers: Dict[str, str],
    params: Optional[Dict[str, Any]],
    log,
    accept: Optional[str] = None,
) -> Tuple[Optional[requests.Response], Optional[str]]:
    """GET with retry/backoff. Honours Retry-After on 429."""
    h = dict(headers)
    if accept is not None:
        h["Accept"] = accept
    attempt = 0
    while True:
        attempt += 1
        try:
            r = session.get(
                url, headers=h, params=params, timeout=HTTP_TIMEOUT_S,
            )
        except requests.RequestException as e:
            log("WARN", f"GET attempt {attempt} {url}: {e}")
            if attempt >= MAX_RETRIES:
                return None, f"connection error: {e}"
            time.sleep(BACKOFF_BASE_S ** attempt)
            continue

        if r.status_code == 200:
            return r, None
        if r.status_code == 429:
            wait = float(r.headers.get("Retry-After", BACKOFF_BASE_S ** attempt))
            log("WARN", f"GET 429 {url}: sleep {wait:.1f}s")
            time.sleep(wait)
            if attempt >= MAX_RETRIES:
                return None, "http 429 (retries exhausted)"
            continue
        if 500 <= r.status_code < 600:
            log("WARN", f"GET {r.status_code} {url} attempt {attempt}")
            if attempt >= MAX_RETRIES:
                return None, f"http {r.status_code} (retries exhausted)"
            time.sleep(BACKOFF_BASE_S ** attempt)
            continue
        # 4xx (other) - permanent for this URL.
        return None, f"http {r.status_code}: {r.text[:200]}"


def http_walk_paginated(
    session: requests.Session,
    start_url: str,
    headers: Dict[str, str],
    log,
    page_size: int = 100,
) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    """Generic DRF paginated walk. Used for any future paginated lookups
    (the timesteps endpoint itself does not paginate)."""
    results: List[Dict[str, Any]] = []
    next_url: Optional[str] = start_url
    params: Optional[Dict[str, Any]] = {"page_size": page_size}
    while next_url:
        r, err = http_get(
            session, next_url, headers, params, log, accept="application/json",
        )
        if err:
            return results, err
        try:
            payload = r.json()
        except ValueError as e:
            return results, f"non-json response: {e}"
        if isinstance(payload, dict) and isinstance(payload.get("results"), list):
            results.extend(payload["results"])
            next_url = payload.get("next")
            params = None
        else:
            results.append(payload)
            next_url = None
    return results, None


# --- Discovery -------------------------------------------------------------

def discover_endpoint(
    session: requests.Session,
    headers: Dict[str, str],
    log,
) -> str:
    """
    Confirm the canonical AOI raster fetch endpoint for this UUID.

    Steps:
      1. GET /rasters/<uuid>/ - inspect for any 'links' field. Lizard v4
         rasters do not normally carry one; we log either way so future
         maintainers can see the result.
      2. GET /rastersources/<rs-uuid>/ - logged for the record. The
         rastersource describes storage; raw fetches still go through
         /rasters/<uuid>/data/.
      3. PROBE GET /rasters/<uuid>/data/ with a sub-pixel bbox at the
         most recent known timestep, format=geotiff, width=1, height=1.
         If 200 OK and the body is non-empty, the endpoint is confirmed.
         No file is written during probing.

    Returns the verified endpoint URL or raises RuntimeError.
    """
    log("INFO", f"discovery: GET {BASE_URL}/rasters/{RASTER_UUID}/")
    r, err = http_get(
        session, f"{BASE_URL}/rasters/{RASTER_UUID}/",
        headers, None, log, accept="application/json",
    )
    if err:
        raise RuntimeError(f"raster detail unreachable: {err}")
    detail = r.json()
    log("INFO", f"raster detail keys: {sorted(detail.keys())}")
    if "links" in detail:
        log("INFO", f"links field present: {detail['links']}")
    else:
        log("INFO", "no 'links' field in raster detail (Lizard v4 standard)")
    last_ts = detail.get("last_value_timestamp")
    log("INFO", f"raster temporal={detail.get('temporal')} interval={detail.get('interval')} "
                f"first={detail.get('first_value_timestamp')} last={last_ts}")

    log("INFO", f"discovery: GET {BASE_URL}/rastersources/{RASTERSOURCE_UUID}/")
    r2, err2 = http_get(
        session, f"{BASE_URL}/rastersources/{RASTERSOURCE_UUID}/",
        headers, None, log, accept="application/json",
    )
    if err2:
        log("WARN", f"rastersource fetch failed (informational): {err2}")
    else:
        rs = r2.json()
        log("INFO", f"rastersource '{rs.get('name')}' size={rs.get('size')} "
                    f"layers_linked={len(rs.get('layers') or [])}")

    if not last_ts:
        raise RuntimeError(
            "raster detail has no last_value_timestamp; cannot probe /data/"
        )

    candidate = f"{BASE_URL}/rasters/{RASTER_UUID}/data/"
    probe_params = {
        "bbox": "151.300,-33.700,151.310,-33.690",
        "time": last_ts,
        "format": "geotiff",
        "projection": "EPSG:4326",
        "width": 1,
        "height": 1,
    }
    log("INFO", f"discovery probe: {candidate} time={last_ts}")
    r3, err3 = http_get(session, candidate, headers, probe_params, log)
    if err3:
        log("ERROR",
            f"probe failed at {candidate}: {err3}. "
            "Inspect rastersource manually and re-run.")
        raise RuntimeError(f"AOI endpoint probe failed: {err3}")
    ctype = r3.headers.get("Content-Type", "")
    size = len(r3.content)
    log("INFO", f"probe OK: status=200 content-type={ctype} bytes={size}")
    if not size:
        raise RuntimeError("probe returned 200 with empty body; aborting")
    return candidate


# --- Timesteps -------------------------------------------------------------

def list_timesteps(
    session: requests.Session,
    headers: Dict[str, str],
    log,
    start: Optional[str] = None,
    end: Optional[str] = None,
) -> List[str]:
    url = f"{BASE_URL}/rasters/{RASTER_UUID}/timesteps/"
    r, err = http_get(session, url, headers, None, log, accept="application/json")
    if err:
        raise RuntimeError(f"timesteps fetch failed: {err}")
    payload = r.json()
    steps = payload.get("steps") or []
    log("INFO", f"timesteps total={len(steps)} "
                f"({payload.get('start')} -> {payload.get('end')})")
    if start:
        steps = [s for s in steps if s >= start]
    if end:
        steps = [s for s in steps if s <= end]
    if start or end:
        log("INFO", f"timesteps after window filter: {len(steps)}")
    return steps


# --- Fetch + write ---------------------------------------------------------

def filename_stamp(ts_iso: str) -> str:
    """ISO 'YYYY-MM-DDTHH:MM:SSZ' -> 'YYYYMMDDTHHMMSSZ' for safe filenames."""
    dt = datetime.strptime(ts_iso, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    return dt.strftime("%Y%m%dT%H%M%SZ")


def fetch_timestep(
    session: requests.Session,
    headers: Dict[str, str],
    log,
    endpoint: str,
    ts_iso: str,
    bbox: Tuple[float, float, float, float],
    fmt: str,
    projection: str,
) -> Tuple[Optional[bytes], Optional[str], Optional[str], Optional[str]]:
    params = {
        "bbox": ",".join(str(v) for v in bbox),
        "start": ts_iso,
        "stop": ts_iso,
        "format": fmt,
        "projection": projection,
    }
    r, err = http_get(session, endpoint, headers, params, log)
    if err:
        return None, None, None, err
    return r.content, r.url, r.headers.get("Content-Type", ""), None


def write_outputs(
    content: bytes,
    ts_iso: str,
    ext: str,
    bbox: Tuple[float, float, float, float],
    request_url: str,
    fmt: str,
    projection: str,
    raw_dir: Path,
    meta_dir: Path,
    overwrite: bool,
    log,
) -> Tuple[str, Path]:
    stamp = filename_stamp(ts_iso)
    raw_path = raw_dir / f"{stamp}_{NAME}.{ext}"
    meta_path = meta_dir / f"{stamp}_{NAME}.json"

    if not overwrite and raw_path.exists():
        log("INFO", f"skip (exists): {raw_path.name}")
        return "skipped", raw_path

    raw_dir.mkdir(parents=True, exist_ok=True)
    meta_dir.mkdir(parents=True, exist_ok=True)
    sha = hashlib.sha256(content).hexdigest()
    tmp = raw_path.with_suffix(raw_path.suffix + ".part")
    try:
        with tmp.open("wb") as fh:
            fh.write(content)
        os.replace(str(tmp), str(raw_path))
    except OSError as e:
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass
        log("ERROR", f"write failed {raw_path}: {e}")
        return "failed", raw_path

    metadata = {
        "timestep_utc": ts_iso,
        "bbox": list(bbox),
        "request_url": request_url,
        "response_bytes": len(content),
        "sha256": sha,
        "unit": UNIT,
        "interval_hours": INTERVAL_HOURS,
        "raster_uuid": RASTER_UUID,
        "rastersource_uuid": RASTERSOURCE_UUID,
        "format": fmt,
        "projection": projection,
        "downloaded_at": datetime.now(timezone.utc).isoformat(),
    }
    meta_path.write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    log("INFO",
        f"wrote: {raw_path.name} bytes={len(content)} sha256={sha[:12]}…")
    return "downloaded", raw_path


# --- Reporting -------------------------------------------------------------

def append_status_report(report_path: Path, summary: Dict[str, Any]) -> None:
    report_path.parent.mkdir(parents=True, exist_ok=True)
    new_file = not report_path.exists()
    lines: List[str] = []
    if new_file:
        lines.append("# Lizard Precipitation Australia AOI Backfill — Status\n")
    lines.append(f"## Run {summary['run_started_at']}\n")
    lines.append(f"- Mode: **{summary['mode']}**")
    lines.append(f"- Endpoint: `{summary.get('endpoint', '-')}`")
    lines.append(f"- Auth: `{summary['auth']}`")
    lines.append(f"- AOI bbox: `{summary['bbox']}`")
    lines.append(f"- Window: `{summary.get('start') or '-'}` → `{summary.get('end') or '-'}`")
    lines.append(f"- Limit: `{summary.get('limit') or '-'}`")
    lines.append("")
    lines.append("| metric | count |")
    lines.append("|---|---|")
    lines.append(f"| timesteps_processed | {summary['timesteps_processed']} |")
    lines.append(f"| downloaded | {summary['downloaded']} |")
    lines.append(f"| skipped (existing) | {summary['skipped']} |")
    lines.append(f"| failed | {summary['failed']} |")
    lines.append("")
    if summary.get("failures"):
        lines.append("### failures")
        for f in summary["failures"]:
            lines.append(f"- `{f['ts']}`: {f['error']}")
        lines.append("")
    lines.append(f"- Raw payloads dir: `{summary['raw_dir']}`")
    lines.append(f"- Metadata dir:     `{summary['meta_dir']}`")
    lines.append(f"- Log file:         `{summary['log_path']}`")
    lines.append("\n---\n")
    with report_path.open("a", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


# --- Main ------------------------------------------------------------------

def parse_bbox(s: str) -> Tuple[float, float, float, float]:
    parts = s.split(",")
    if len(parts) != 4:
        raise argparse.ArgumentTypeError(
            "bbox must be 'west,south,east,north'"
        )
    try:
        w, s_, e, n = (float(x) for x in parts)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"bbox parse: {exc}")
    if not (w < e and s_ < n):
        raise argparse.ArgumentTypeError(
            f"bbox not ordered: west<east and south<north required (got {parts})"
        )
    return (w, s_, e, n)


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--bbox", type=parse_bbox, default=DEFAULT_BBOX,
                   help="west,south,east,north (default Northern Beaches)")
    p.add_argument("--start", default=None,
                   help="Inclusive ISO start, e.g. 2024-01-01T00:00:00Z")
    p.add_argument("--end", default=None,
                   help="Inclusive ISO end, e.g. 2024-01-31T21:00:00Z")
    p.add_argument("--limit", type=int, default=None,
                   help="Cap timesteps processed this run")
    p.add_argument("--write", action="store_true",
                   help="Actually fetch and persist (default dry-run)")
    p.add_argument("--overwrite", action="store_true",
                   help="Re-fetch and replace existing files")
    p.add_argument("--out-root", default=str(DEFAULT_OUT_ROOT_REL),
                   help="Override default output root")
    p.add_argument("--report", default=str(REPORT_PATH_REL),
                   help="Status report path")
    p.add_argument("--verbose", action="store_true")
    args = p.parse_args(argv)

    out_root = Path(args.out_root)
    raw_dir = out_root / "raw_payloads"
    meta_dir = out_root / "metadata"
    log_dir = out_root / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    log_path = log_dir / f"backfill_{run_id}.log"
    log_lines: List[str] = []

    def log(level: str, msg: str) -> None:
        line = f"{datetime.now(timezone.utc).isoformat()} {level} {msg}"
        log_lines.append(line)
        if args.verbose or level in ("WARN", "ERROR"):
            print(line, flush=True)

    token = os.environ.get("LIZARD_API_TOKEN", "").strip() or None
    headers, auth_label = build_auth_headers(token)
    log("INFO", f"auth: {auth_label}")
    session = requests.Session()

    summary: Dict[str, Any] = {
        "run_started_at": datetime.now(timezone.utc).isoformat(),
        "mode": "write" if args.write else "dry-run",
        "bbox": list(args.bbox),
        "start": args.start, "end": args.end, "limit": args.limit,
        "auth": auth_label,
        "timesteps_processed": 0,
        "downloaded": 0,
        "skipped": 0,
        "failed": 0,
        "failures": [],
        "raw_dir": str(raw_dir),
        "meta_dir": str(meta_dir),
        "log_path": str(log_path),
        "endpoint": None,
    }

    try:
        endpoint = discover_endpoint(session, headers, log)
        summary["endpoint"] = endpoint
    except Exception as exc:
        log("ERROR", f"discovery failed: {exc}")
        log_path.write_text("\n".join(log_lines) + "\n", encoding="utf-8")
        append_status_report(Path(args.report), summary)
        print(json.dumps({"status": "discovery_failed",
                          "error": str(exc),
                          "log_file": str(log_path)}, indent=2))
        return 2

    try:
        steps = list_timesteps(
            session, headers, log, start=args.start, end=args.end,
        )
    except Exception as exc:
        log("ERROR", f"timesteps list failed: {exc}")
        log_path.write_text("\n".join(log_lines) + "\n", encoding="utf-8")
        append_status_report(Path(args.report), summary)
        print(json.dumps({"status": "timesteps_failed",
                          "error": str(exc),
                          "log_file": str(log_path)}, indent=2))
        return 2

    if args.limit is not None:
        steps = steps[: args.limit]
    summary["timesteps_processed"] = len(steps)
    log("INFO",
        f"intend to process {len(steps)} timestep(s); mode={summary['mode']}")

    for ts in steps:
        if not args.write:
            preview_url = (
                f"{endpoint}?bbox={','.join(str(v) for v in args.bbox)}"
                f"&time={ts}&format={TARGET_FORMAT}&projection={TARGET_PROJECTION}"
            )
            log("INFO", f"DRY-RUN would GET {preview_url}")
            continue
        try:
            content, request_url, ctype, err = fetch_timestep(
                session, headers, log, endpoint, ts, args.bbox,
                TARGET_FORMAT, TARGET_PROJECTION,
            )
            if err or content is None:
                log("ERROR", f"fetch failed {ts}: {err}")
                summary["failed"] += 1
                summary["failures"].append({"ts": ts, "error": err or "no content"})
                continue
            ext = "tif" if "tiff" in (ctype or "").lower() else TARGET_FORMAT
            outcome, _ = write_outputs(
                content, ts, ext, args.bbox, request_url,
                TARGET_FORMAT, TARGET_PROJECTION,
                raw_dir, meta_dir, args.overwrite, log,
            )
            if outcome == "downloaded":
                summary["downloaded"] += 1
            elif outcome == "skipped":
                summary["skipped"] += 1
            else:
                summary["failed"] += 1
                summary["failures"].append({"ts": ts, "error": "write failed"})
        except Exception as exc:
            log("ERROR", f"unexpected on {ts}: {exc}")
            summary["failed"] += 1
            summary["failures"].append({"ts": ts, "error": str(exc)})

    log_path.write_text("\n".join(log_lines) + "\n", encoding="utf-8")
    append_status_report(Path(args.report), summary)
    out_summary = {k: v for k, v in summary.items() if k != "failures"}
    out_summary["failures"] = len(summary["failures"])
    print(json.dumps(out_summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
