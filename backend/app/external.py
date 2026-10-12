"""Client for the MTU reporting API (rabota.mtutoshkent.uz): freight and uborka reports.

The key lives only in backend/.env (EXTERNAL_API_KEY) and never reaches the browser. Reports are fetched month by month
(the API returns ~3 MB per month per branch), reduced to per-station daily sums and cached in memory:
past months for 6 hours, the current month for 10 minutes.

Each report row is one station ("user") for one date and one shift ("den" day / "noch" night); shifts are summed.
"""
import json
import logging
import os
import re
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date

from . import models as m

log = logging.getLogger("silkrail.external")

API_URL = os.getenv("EXTERNAL_API_URL", "https://rabota.mtutoshkent.uz/api").rstrip("/")
API_KEY = os.getenv("EXTERNAL_API_KEY", "")
# branches to look stations up in; several MTUs can be listed comma-separated
BRANCHES = [b.strip() for b in os.getenv("EXTERNAL_API_BRANCHES", "Toshkent MTU").split(",") if b.strip()]
TIMEOUT = 90  # a month is ~3 MB and their server is slow under load
DATA_DIR = os.getenv("DATA_DIR", "data")
OVERRIDES_FILE = os.path.join(DATA_DIR, "external_stations.json")  # {"<our ESR>": "<API station name>"}
# reduced past months are kept on disk so a restart does not download history again (~3 MB per month per report)
CACHE_DIR = os.path.join(DATA_DIR, "cache", "external")
DISK_TTL = 3 * 24 * 3600  # past months may still get late corrections: refresh them every few days
HISTORY_START = date(2025, 1, 1)  # the API has no data before 2025

# numeric fields we keep from each report (everything else is dropped right after download)
FREIGHT_FIELDS = ("arrival", "departure", "load_all", "load_sng", "unload_all", "unload_sng", "und_load_all", "und_unload_all",
                  "tannaj_all", "tannaj_chis", "tannaj_os", "vnut_load", "vnut_load_ton", "night_unload", "pul_tushumi", "daromad")
# wagon types in the uborka (wagon supply) report: covered, flat, gondola, tank, grain hopper, cement hopper, fitting flat, other
WAGON_TYPES = ("kr", "pl", "pv", "chs", "zer", "sem", "fit", "pr")
UBORKA_FIELDS = tuple(f"zayavka_{w}" for w in WAGON_TYPES) + tuple(f"done_{w}" for w in WAGON_TYPES)
REPORT_FIELDS = {"freight-report": FREIGHT_FIELDS, "uborka-report": UBORKA_FIELDS}


class ExternalError(Exception):
    pass


def enabled() -> bool:
    return bool(API_KEY)


def _request(report: str, branch: str, start: str, end: str) -> list[dict]:
    q = urllib.parse.urlencode({"branch_name": branch, "from_date": start, "to_date": end})
    req = urllib.request.Request(f"{API_URL}/{report}/?{q}", headers={
        "X-API-Key": API_KEY, "Accept": "application/json", "User-Agent": "SilkRail/1.0"})
    for attempt in (1, 2):  # one retry for network hiccups / timeouts
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:  # unknown branch
                return []
            raise ExternalError(f"http_{e.code}")
        except Exception as e:  # network down, timeout, bad JSON
            if attempt == 2:
                raise ExternalError(type(e).__name__)
            log.warning("external %s %s: %s, retrying", report, start[:7], e)
            time.sleep(2)


# ---------- month cache: {(report, branch, "YYYY-MM"): (expires, {api_station: {date: {field: sum}}})} ----------
_CACHE: dict[tuple, tuple[float, dict]] = {}
_LOCK = threading.Lock()
_KEY_LOCKS: dict[tuple, threading.Lock] = {}  # one download per month at a time (page visits + warm-up)


def _disk_path(key: tuple) -> str:
    report, branch, ym = key
    safe = re.sub(r"[^A-Za-z0-9_-]+", "_", branch)
    return os.path.join(CACHE_DIR, f"{report}__{safe}__{ym}.json")


def _disk_get(key: tuple) -> dict | None:
    path = _disk_path(key)
    try:
        if time.time() - os.path.getmtime(path) < DISK_TTL:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
    except (OSError, ValueError):
        pass
    return None


def _disk_put(key: tuple, agg: dict):
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        tmp = _disk_path(key) + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(agg, f, ensure_ascii=False, separators=(",", ":"))
        os.replace(tmp, _disk_path(key))
    except OSError as e:
        log.warning("external cache write failed: %s", e)


def _month_bounds(ym: str) -> tuple[date, date]:
    y, mo = map(int, ym.split("-"))
    nxt = date(y + (mo == 12), mo % 12 + 1, 1)
    return date(y, mo, 1), date.fromordinal(nxt.toordinal() - 1)


def _month(report: str, branch: str, ym: str) -> dict:
    key = (report, branch, ym)
    hit = _CACHE.get(key)
    if hit and hit[0] > time.time():
        return hit[1]
    with _LOCK:
        klock = _KEY_LOCKS.setdefault(key, threading.Lock())
    with klock:
        hit = _CACHE.get(key)  # another request may have fetched it while we waited
        if hit and hit[0] > time.time():
            return hit[1]
        return _load_month(key)


def _load_month(key: tuple) -> dict:
    report, branch, ym = key
    a, b = _month_bounds(ym)
    today = date.today()
    if a > today:
        return {}
    current = (a.year, a.month) == (today.year, today.month)
    if not current:
        disk = _disk_get(key)
        if disk is not None:
            with _LOCK:
                _CACHE[key] = (time.time() + 6 * 3600, disk)
            return disk
    rows = _request(report, branch, a.isoformat(), min(b, today).isoformat())
    fields = REPORT_FIELDS[report]
    agg: dict[str, dict[str, dict]] = {}
    for r in rows:
        day = agg.setdefault(r["user"], {}).setdefault(r["date"], {})
        day["_shifts"] = day.get("_shifts", 0) + 1  # to average stock values (wagons standing) over the shifts
        for f in fields:
            v = r.get(f)
            if isinstance(v, (int, float)):
                day[f] = day.get(f, 0) + v
        note = (r.get("uborka") or "").strip()
        if report == "uborka-report" and note and note not in ("0", "-", "—"):  # free-text log of wagon removal
            day.setdefault("_notes", []).append({"shift": r.get("time"), "text": note[:500], "by": (r.get("full_name") or "")[:80]})
    with _LOCK:
        _CACHE[key] = (time.time() + (600 if current else 6 * 3600), agg)
    if not current:
        _disk_put(key, agg)
    return agg


def warm_up():
    """Fetch the whole history in the background (newest first), so pages open without waiting for downloads."""
    if not enabled():
        return
    months = list(reversed(_months(HISTORY_START, date.today())))

    def run():
        t0 = time.time()
        for branch in BRANCHES:
            for ym in months:
                for report in REPORT_FIELDS:
                    try:
                        _month(report, branch, ym)
                    except ExternalError as e:
                        log.warning("warm-up %s %s %s: %s", report, branch, ym, e)
        log.info("external API cache warmed in %.0fs", time.time() - t0)

    threading.Thread(target=run, name="external-warm-up", daemon=True).start()


def _months(start: date, end: date) -> list[str]:
    out, y, mo = [], start.year, start.month
    while (y, mo) <= (end.year, end.month):
        out.append(f"{y:04d}-{mo:02d}")
        y, mo = (y + 1, 1) if mo == 12 else (y, mo + 1)
    return out


def report_days(report: str, api_station: str, branch: str, start: date, end: date) -> dict[str, dict]:
    """{date: {field: sum of both shifts}} for one station."""
    months = _months(start, end)
    with ThreadPoolExecutor(max_workers=2) as ex:  # their server times out with more parallel downloads
        parts = list(ex.map(lambda ym: _month(report, branch, ym), months))
    out = {}
    for part in parts:
        for d, vals in part.get(api_station, {}).items():
            if start.isoformat() <= d <= end.isoformat():
                out[d] = vals
    return out


def freight_days(api_station: str, branch: str, start: date, end: date) -> dict[str, dict]:
    return report_days("freight-report", api_station, branch, start, end)


def uborka_days(api_station: str, branch: str, start: date, end: date) -> dict[str, dict]:
    return report_days("uborka-report", api_station, branch, start, end)


# ---------- station mapping ----------
def _norm(x: str) -> str:
    x = unicodedata.normalize("NFKD", x).lower()
    for a in "ʻ‘’`ʼ":
        x = x.replace(a, "'")
    x = re.sub(r"\d+", "", x).replace("_", " ").replace("-", " ")
    x = re.sub(r"[^a-z' ]", "", x)
    return re.sub(r"\s+", " ", x).strip()


def _loose(x: str) -> str:
    x = _norm(x).replace("'", "").replace(" ", "")
    return x.replace("x", "h").replace("q", "k").replace("yo", "e").replace("o", "a")


def _overrides() -> dict:
    if os.path.exists(OVERRIDES_FILE):
        with open(OVERRIDES_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def api_stations(branch: str) -> list[str]:
    """Station names the branch reports under (taken from the current month)."""
    ym = date.today().strftime("%Y-%m")
    return sorted(_month("freight-report", branch, ym).keys())


def match_station(s: m.Station) -> tuple[str, str, str] | None:
    """(api_name, branch, how) for one of our stations, or None. how = manual | exact | partial."""
    manual = _overrides().get(s.esr_code)
    for branch in BRANCHES:
        names = api_stations(branch)
        if manual:
            if manual in names:
                return manual, branch, "manual"
            continue
        for n in names:
            if _norm(n) == _norm(s.name):
                return n, branch, "exact"
        for n in names:
            if _loose(n) == _loose(s.name):
                return n, branch, "partial"
        for n in names:  # ESR prefix in the login, e.g. Darband7291 -> ESR 7291xx
            pre = re.findall(r"\d{4,}", n)
            if pre and s.esr_code.startswith(pre[0]):
                return n, branch, "partial"
    return None
