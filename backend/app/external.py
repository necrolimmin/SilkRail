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
TIMEOUT = 40
DATA_DIR = os.getenv("DATA_DIR", "data")
OVERRIDES_FILE = os.path.join(DATA_DIR, "external_stations.json")  # {"<our ESR>": "<API station name>"}

# numeric fields we keep from each report (everything else is dropped right after download)
FREIGHT_FIELDS = ("arrival", "departure", "load_all", "load_sng", "unload_all", "unload_sng", "und_load_all", "und_unload_all",
                  "tannaj_all", "tannaj_chis", "tannaj_os", "vnut_load", "vnut_load_ton", "night_unload", "pul_tushumi", "daromad")


class ExternalError(Exception):
    pass


def enabled() -> bool:
    return bool(API_KEY)


def _request(report: str, branch: str, start: str, end: str) -> list[dict]:
    q = urllib.parse.urlencode({"branch_name": branch, "from_date": start, "to_date": end})
    req = urllib.request.Request(f"{API_URL}/{report}/?{q}", headers={
        "X-API-Key": API_KEY, "Accept": "application/json", "User-Agent": "SilkRail/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 404:  # unknown branch
            return []
        raise ExternalError(f"http_{e.code}")
    except Exception as e:  # network down, timeout, bad JSON
        raise ExternalError(type(e).__name__)


# ---------- month cache: {(report, branch, "YYYY-MM"): (expires, {api_station: {date: {field: sum}}})} ----------
_CACHE: dict[tuple, tuple[float, dict]] = {}
_LOCK = threading.Lock()


def _month_bounds(ym: str) -> tuple[date, date]:
    y, mo = map(int, ym.split("-"))
    nxt = date(y + (mo == 12), mo % 12 + 1, 1)
    return date(y, mo, 1), date.fromordinal(nxt.toordinal() - 1)


def _month(report: str, branch: str, ym: str) -> dict:
    key = (report, branch, ym)
    hit = _CACHE.get(key)
    if hit and hit[0] > time.time():
        return hit[1]
    a, b = _month_bounds(ym)
    today = date.today()
    if a > today:
        return {}
    rows = _request(report, branch, a.isoformat(), min(b, today).isoformat())
    fields = FREIGHT_FIELDS
    agg: dict[str, dict[str, dict[str, int]]] = {}
    for r in rows:
        day = agg.setdefault(r["user"], {}).setdefault(r["date"], {})
        day["_shifts"] = day.get("_shifts", 0) + 1  # to average stock values (wagons standing) over the shifts
        for f in fields:
            v = r.get(f)
            if isinstance(v, (int, float)):
                day[f] = day.get(f, 0) + v
    ttl = 600 if (a.year, a.month) == (today.year, today.month) else 6 * 3600
    with _LOCK:
        _CACHE[key] = (time.time() + ttl, agg)
    return agg


def _months(start: date, end: date) -> list[str]:
    out, y, mo = [], start.year, start.month
    while (y, mo) <= (end.year, end.month):
        out.append(f"{y:04d}-{mo:02d}")
        y, mo = (y + 1, 1) if mo == 12 else (y, mo + 1)
    return out


def freight_days(api_station: str, branch: str, start: date, end: date) -> dict[str, dict]:
    """{date: {field: sum of both shifts}} for one station."""
    months = _months(start, end)
    with ThreadPoolExecutor(max_workers=4) as ex:
        parts = list(ex.map(lambda ym: _month("freight-report", branch, ym), months))
    out = {}
    for part in parts:
        for d, vals in part.get(api_station, {}).items():
            if start.isoformat() <= d <= end.isoformat():
                out[d] = vals
    return out


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
