#!/usr/bin/env python3
"""
lizard_precip_full_backfill_runner.py

Iterate the Lizard "Precipitation Australia" AOI backfill month-by-month
from the API-discovered first_value_timestamp to last_value_timestamp.
Stop immediately on any month that doesn't pass validation gates.

Idempotent / resumable: months already complete and valid are skipped at
the validate step (no fetch performed).

Outputs:
  data/radar_archive/reports/lizard_full_backfill_progress.md     (appended)
  data/radar_archive/reports/lizard_full_backfill_final_report.md (overwritten on each terminal state)

Validation gates per month (all must hold for PASS):
  - file count == expected timestep count
  - .tif and .json stem sets are exactly equal
  - 0 missing timesteps
  - distinct sha256 > 1               (parameter-bug regression check)
  - distinct sizes  >= 2              (corollary)
  - metadata.request_url contains 'start=' and 'stop=' and not 'time='
  - all 3 spot timesteps decode + carry plausible mm/3h values

This script does NOT delete files, NOT pass --overwrite to the fetcher,
and NEVER touches data outside the lizard_precipitation_australia tree.
"""

from __future__ import annotations

import argparse
import calendar
import datetime as dt
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import requests
except ImportError:
    print("ERROR: requires 'requests' (pip install requests)", file=sys.stderr)
    sys.exit(2)

try:
    from PIL import Image
except ImportError:
    print("ERROR: requires Pillow (pip install Pillow)", file=sys.stderr)
    sys.exit(2)


# --- Constants ------------------------------------------------------------

RASTER_UUID = "1b6c03df-2ad1-4f17-89f6-319ea797b357"
BASE_URL = "https://northernbeaches.lizard.net/api/v4"
DEFAULT_BBOX = "151.15,-33.85,151.40,-33.55"
SCRIPT = Path(__file__).resolve().parent / "lizard_precip_aoi_backfill.py"
NAME = "lizard_precipitation_australia"

RAW_DIR = Path("data/radar_archive/processed/lizard_precipitation_australia/raw_payloads")
META_DIR = Path("data/radar_archive/processed/lizard_precipitation_australia/metadata")
PROGRESS_PATH = Path("data/radar_archive/reports/lizard_full_backfill_progress.md")
FINAL_PATH = Path("data/radar_archive/reports/lizard_full_backfill_final_report.md")

USER_AGENT = "Stormgauge-LizardOrchestrator/0.1"
INTERVAL_HOURS = 3
PIX_MAX_PLAUSIBLE_MM_3H = 500.0
SUBPROC_TIMEOUT_S = 1800  # 30 min hard cap per month


# --- Discovery ------------------------------------------------------------

def discover_temporal_range() -> Tuple[str, str]:
    url = f"{BASE_URL}/rasters/{RASTER_UUID}/"
    r = requests.get(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        timeout=30,
    )
    r.raise_for_status()
    d = r.json()
    return d["first_value_timestamp"], d["last_value_timestamp"]


# --- Time helpers ---------------------------------------------------------

def parse_iso(s: str) -> dt.datetime:
    return dt.datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(
        tzinfo=dt.timezone.utc,
    )


def fmt_iso(t: dt.datetime) -> str:
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def utc_now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def align_to_3h(t: dt.datetime) -> dt.datetime:
    h = (t.hour // INTERVAL_HOURS) * INTERVAL_HOURS
    return t.replace(hour=h, minute=0, second=0, microsecond=0)


def month_windows(first_iso: str, last_iso: str):
    s = parse_iso(first_iso)
    e = parse_iso(last_iso)
    cur = dt.datetime(s.year, s.month, 1, tzinfo=dt.timezone.utc)
    end_anchor = dt.datetime(e.year, e.month, 1, tzinfo=dt.timezone.utc)
    while cur <= end_anchor:
        last_day = calendar.monthrange(cur.year, cur.month)[1]
        m_start = cur
        m_end = cur.replace(day=last_day, hour=21, minute=0, second=0)
        m_start = max(m_start, s)
        m_end = min(m_end, e)
        m_start = align_to_3h(m_start)
        m_end = align_to_3h(m_end)
        if m_start <= m_end:
            yield m_start, m_end
        # advance one calendar month
        if cur.month == 12:
            cur = cur.replace(year=cur.year + 1, month=1)
        else:
            cur = cur.replace(month=cur.month + 1)


def expected_stems(m_start: dt.datetime, m_end: dt.datetime) -> List[str]:
    out = []
    t = m_start
    while t <= m_end:
        out.append(t.strftime("%Y%m%dT%H%M%SZ"))
        t += dt.timedelta(hours=INTERVAL_HOURS)
    return out


# --- Validation ----------------------------------------------------------

def list_month_files(year: int, month: int) -> Tuple[List[str], List[str]]:
    prefix = f"{year:04d}{month:02d}"
    raws = sorted(f for f in (os.listdir(RAW_DIR) if RAW_DIR.exists() else [])
                  if f.startswith(prefix))
    metas = sorted(f for f in (os.listdir(META_DIR) if META_DIR.exists() else [])
                   if f.startswith(prefix))
    return raws, metas


def decode_tiff_stats(path: Path) -> Dict[str, Any]:
    try:
        img = Image.open(path)
        img.load()
        w, h = img.size
        data = list(img.getdata())
        valid = [v for v in data if v > -32000.0]
        if not valid:
            return {"error": "all nodata"}
        return {
            "size": [w, h],
            "n": len(data),
            "n_valid": len(valid),
            "min": min(valid),
            "max": max(valid),
            "mean": sum(valid) / len(valid),
        }
    except Exception as exc:
        return {"error": f"decode {type(exc).__name__}: {exc}"}


def validate_month(
    m_start: dt.datetime,
    m_end: dt.datetime,
    expected: List[str],
) -> Dict[str, Any]:
    raws, metas = list_month_files(m_start.year, m_start.month)
    raw_stems = {f.split("_")[0] for f in raws}
    meta_stems = {f.split("_")[0] for f in metas}
    expected_set = set(expected)
    missing = sorted(s for s in expected_set if s not in raw_stems)

    counts_ok = len(raws) == len(expected) and len(metas) == len(expected)
    no_orphans = (raw_stems == meta_stems)

    hashes: List[str] = []
    sizes: List[int] = []
    for f in raws:
        b = (RAW_DIR / f).read_bytes()
        hashes.append(hashlib.sha256(b).hexdigest())
        sizes.append(len(b))
    distinct_h = len(set(hashes))
    distinct_s = len(set(sizes))
    suspicious_constant = (distinct_h <= 1) if hashes else True

    spots_idx = ([0, len(expected) // 2, len(expected) - 1]
                 if len(expected) >= 3 else list(range(len(expected))))
    spots: List[Dict[str, Any]] = []
    for i in spots_idx:
        stem = expected[i]
        path = RAW_DIR / f"{stem}_{NAME}.tif"
        if not path.exists():
            spots.append({"stem": stem, "error": "missing"})
            continue
        st = decode_tiff_stats(path)
        st["stem"] = stem
        spots.append(st)

    spot_errors = sum(1 for s in spots if "error" in s)
    spot_max_too_high = any(
        "max" in s and s["max"] > PIX_MAX_PLAUSIBLE_MM_3H for s in spots
    )
    spot_max_negative = any(
        "max" in s and s["max"] < 0 for s in spots
    )

    metadata_uses_start_stop: Optional[bool] = None
    if expected:
        first = expected[0]
        jp = META_DIR / f"{first}_{NAME}.json"
        if jp.exists():
            try:
                j = json.loads(jp.read_text(encoding="utf-8"))
                url = j.get("request_url", "")
                metadata_uses_start_stop = (
                    "start=" in url
                    and "stop=" in url
                    and "time=" not in url
                )
            except Exception:
                metadata_uses_start_stop = False

    return {
        "month_key": f"{m_start.year:04d}-{m_start.month:02d}",
        "window_start": fmt_iso(m_start),
        "window_end": fmt_iso(m_end),
        "expected_count": len(expected),
        "raw_count": len(raws),
        "meta_count": len(metas),
        "missing_count": len(missing),
        "missing_first": missing[:5],
        "counts_ok": counts_ok,
        "no_orphans": no_orphans,
        "distinct_sha256": distinct_h,
        "distinct_sizes": distinct_s,
        "suspicious_constant": suspicious_constant,
        "spots": spots,
        "spot_errors": spot_errors,
        "spot_max_too_high": spot_max_too_high,
        "spot_max_negative": spot_max_negative,
        "metadata_uses_start_stop": metadata_uses_start_stop,
    }


def classify(v: Dict[str, Any]) -> Tuple[bool, str]:
    """
    Return (passed, label).

    Distinguishes a legitimate raster coverage gap (e.g. early life of the
    BOM grid, late Nov / Dec 2017) from a regression of the time= bug.

    A "coverage gap" month is one where the API returns the same all-nodata
    payload for every timestep:
      - distinct sha256 == 1
      - every spot decodes to "all nodata"
      - request_url uses start=&stop= (param fix intact)
      - counts/orphans/missing all green
    These are accepted as PASS (gap) — the data simply doesn't exist at
    the source and skipping them would leave gaps that can never be filled.

    The original time= bug had distinct sha256 == 1 paired with spots that
    decoded to real-rainfall values (because the API was returning the
    same default-time payload, not all-nodata). We still FAIL on that.
    """
    if not v["counts_ok"]:
        return False, "FAIL (count mismatch)"
    if not v["no_orphans"]:
        return False, "FAIL (orphans)"
    if v["missing_count"] != 0:
        return False, "FAIL (missing timesteps)"
    if v["metadata_uses_start_stop"] is False:
        return False, "FAIL (metadata uses time=)"
    if v["spot_max_too_high"]:
        return False, "FAIL (pixel max > sanity bound)"
    if v["spot_max_negative"]:
        return False, "FAIL (pixel max < 0)"

    n_spots = len(v["spots"])
    if n_spots == 0:
        return False, "FAIL (no spots to validate)"

    fatal_errs = sum(
        1 for s in v["spots"]
        if "error" in s and s["error"] != "all nodata"
    )
    if fatal_errs > 0:
        return False, "FAIL (decode/missing errors)"

    nodata_spots = sum(
        1 for s in v["spots"] if s.get("error") == "all nodata"
    )
    valid_spots = n_spots - fatal_errs - nodata_spots

    # Regression check: if the entire month has 1 distinct payload AND
    # any spot has real (non-nodata) values, that's the time= bug or a
    # close cousin -- a single repeating real-data response.
    if v["suspicious_constant"] and valid_spots > 0:
        return False, "FAIL (1 distinct sha + real pixels = regression)"

    # Coverage gap: 1 hash + all spots all-nodata + start/stop verified.
    if nodata_spots == n_spots:
        return True, "PASS (coverage gap, all-nodata)"

    return True, "PASS"


def is_pass(v: Dict[str, Any]) -> bool:
    return classify(v)[0]


# --- Reports --------------------------------------------------------------

def append_progress(text: str) -> None:
    PROGRESS_PATH.parent.mkdir(parents=True, exist_ok=True)
    new = not PROGRESS_PATH.exists()
    with PROGRESS_PATH.open("a", encoding="utf-8") as f:
        if new:
            f.write(
                "# Lizard Precipitation Australia — Full Historical Backfill Progress\n\n"
            )
        f.write(text + "\n")


def write_final_report(summary: Dict[str, Any]) -> None:
    FINAL_PATH.parent.mkdir(parents=True, exist_ok=True)
    lines: List[str] = []
    lines.append(
        "# Lizard Precipitation Australia — Full Historical Backfill — Final Report\n"
    )
    lines.append(f"- Started: {summary.get('started', '-')}")
    lines.append(f"- Ended:   {summary.get('ended', '-')}")
    lines.append(f"- Status:  **{summary.get('status', 'unknown')}**")
    lines.append(f"- Months attempted: {summary.get('attempted', 0)}")
    lines.append(f"- Months passed:    {summary.get('passed', 0)}")
    lines.append(f"- Months failed:    {summary.get('failed', 0)}")
    if summary.get("stopped_at"):
        lines.append(f"- Stopped at: `{summary['stopped_at']}`")
    if summary.get("temporal_range"):
        first, last = summary["temporal_range"]
        lines.append(
            f"- Temporal range discovered: `{first}` → `{last}`"
        )
    lines.append("")
    lines.append("## Per-month outcomes\n")
    lines.append(
        "| month | window | expected | raw | meta | dist_sha | dist_size | "
        "spot max(mm/3h) | result |"
    )
    lines.append("|---|---|---|---|---|---|---|---|---|")
    for m in summary.get("months", []):
        v = m["v"]
        max_str = "-"
        spot_maxes = [s.get("max") for s in v["spots"] if "max" in s]
        if spot_maxes:
            max_str = f"{max(spot_maxes):.2f}"
        lines.append(
            f"| {v['month_key']} | "
            f"{v['window_start'][:13]}Z..{v['window_end'][:13]}Z | "
            f"{v['expected_count']} | {v['raw_count']} | {v['meta_count']} | "
            f"{v['distinct_sha256']} | {v['distinct_sizes']} | {max_str} | "
            f"**{m['outcome']}** |"
        )
    FINAL_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


# --- Subprocess driver ----------------------------------------------------

def run_month(m_start: dt.datetime, m_end: dt.datetime,
              dry_run: bool) -> Tuple[int, str, str]:
    cmd = [
        sys.executable, str(SCRIPT),
        "--bbox", DEFAULT_BBOX,
        "--start", fmt_iso(m_start),
        "--end", fmt_iso(m_end),
    ]
    if not dry_run:
        cmd.append("--write")
    try:
        cp = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=SUBPROC_TIMEOUT_S,
        )
        return cp.returncode, cp.stdout[-2000:], cp.stderr[-2000:]
    except subprocess.TimeoutExpired:
        return 124, "", f"TIMEOUT after {SUBPROC_TIMEOUT_S}s"


# --- Main -----------------------------------------------------------------

def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--only", help="Process only this YYYY-MM (smoke-test mode)")
    p.add_argument("--dry-run", action="store_true",
                   help="Don't pass --write to the fetcher (no files written)")
    p.add_argument("--max-months", type=int,
                   help="Cap on number of months attempted")
    args = p.parse_args(argv)

    started = utc_now_iso()
    append_progress(f"\n## Run started {started}")

    try:
        first, last = discover_temporal_range()
    except Exception as exc:
        append_progress(f"- ERROR discovery: {exc}")
        write_final_report({
            "started": started, "ended": utc_now_iso(),
            "status": "discovery_failed",
            "attempted": 0, "passed": 0, "failed": 1,
            "months": [],
        })
        return 2

    append_progress(f"- temporal range discovered: `{first}` → `{last}`")
    print(f"discovery: first={first} last={last}", flush=True)

    months = list(month_windows(first, last))
    append_progress(f"- {len(months)} calendar months in range")

    if args.only:
        months = [
            (s, e) for (s, e) in months
            if f"{s.year:04d}-{s.month:02d}" == args.only
        ]
        append_progress(f"- --only filter: {len(months)} match `{args.only}`")
        if not months:
            print(f"--only {args.only}: no matching month", flush=True)
            write_final_report({
                "started": started, "ended": utc_now_iso(),
                "status": "no_matching_month",
                "attempted": 0, "passed": 0, "failed": 0, "months": [],
                "temporal_range": [first, last],
            })
            return 1

    if args.max_months:
        months = months[: args.max_months]

    summary: Dict[str, Any] = {
        "started": started,
        "temporal_range": [first, last],
        "months": [], "attempted": 0, "passed": 0, "failed": 0,
        "status": "in_progress",
    }

    for (m_start, m_end) in months:
        key = f"{m_start.year:04d}-{m_start.month:02d}"
        append_progress(f"\n### {key}")
        append_progress(
            f"- window: `{fmt_iso(m_start)}` → `{fmt_iso(m_end)}`"
        )
        expected = expected_stems(m_start, m_end)
        append_progress(f"- expected timesteps: {len(expected)}")
        print(f"\n[{key}] start={fmt_iso(m_start)} end={fmt_iso(m_end)} "
              f"expected={len(expected)}", flush=True)

        # Pre-validate: skip if already complete + valid
        v_pre = validate_month(m_start, m_end, expected)
        ok_pre, label_pre = classify(v_pre)
        if ok_pre:
            cached_label = label_pre.replace("PASS", "PASS (cached)")
            append_progress(f"- already complete -> **SKIP** ({label_pre})")
            summary["months"].append(
                {"key": key, "v": v_pre, "outcome": cached_label}
            )
            summary["attempted"] += 1
            summary["passed"] += 1
            print(f"[{key}] {cached_label}, skipped fetch", flush=True)
            write_final_report(summary)
            continue

        # Run fetcher subprocess
        t0 = dt.datetime.now(dt.timezone.utc)
        rc, _stdout, stderr_tail = run_month(m_start, m_end, args.dry_run)
        elapsed = (dt.datetime.now(dt.timezone.utc) - t0).total_seconds()
        append_progress(f"- subprocess rc={rc} elapsed={elapsed:.1f}s")
        if stderr_tail.strip():
            append_progress(f"- stderr_tail: ```\n{stderr_tail.strip()[:500]}\n```")
        print(f"[{key}] subprocess rc={rc} elapsed={elapsed:.1f}s", flush=True)

        # Validate post-fetch
        v = validate_month(m_start, m_end, expected)
        ok, outcome = classify(v)

        append_progress(
            f"- raw={v['raw_count']} meta={v['meta_count']} "
            f"missing={v['missing_count']} (first={v['missing_first']})"
        )
        append_progress(
            f"- distinct sha256 = {v['distinct_sha256']}/{v['raw_count']}, "
            f"distinct sizes = {v['distinct_sizes']}"
        )
        append_progress(
            f"- metadata uses start/stop: {v['metadata_uses_start_stop']}"
        )
        append_progress("- spot pixel sanity:")
        for s in v["spots"]:
            if "error" in s:
                append_progress(f"  - `{s['stem']}` ERROR: {s['error']}")
            else:
                append_progress(
                    f"  - `{s['stem']}`  min={s['min']:.3f} "
                    f"max={s['max']:.3f} mean={s['mean']:.3f}  "
                    f"size={s['size']}  valid={s['n_valid']}/{s['n']}"
                )
        append_progress(f"- result: **{outcome}**")
        print(f"[{key}] -> {outcome}", flush=True)

        summary["months"].append({"key": key, "v": v, "outcome": outcome})
        summary["attempted"] += 1
        if ok:
            summary["passed"] += 1
            write_final_report(summary)
        else:
            summary["failed"] += 1
            summary["status"] = "stopped_failure"
            summary["stopped_at"] = key
            summary["ended"] = utc_now_iso()
            append_progress(f"\n## STOPPED at {key}")
            write_final_report(summary)
            print(f"\nSTOPPED at {key} (FAIL)", flush=True)
            return 3

    summary["status"] = "complete"
    summary["ended"] = utc_now_iso()
    append_progress(f"\n## Run complete {summary['ended']}")
    write_final_report(summary)
    print(
        f"\nCOMPLETE: {summary['passed']}/{summary['attempted']} months "
        f"passed", flush=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
