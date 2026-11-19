"""Railway kilometre posts (chainage) along the map's track lines, tied to the official MTU scheme.

The scheme gives each station its km post ("3388+309" = km 3388 + 309 m, "12 km PK7" = km 12, picket 7). Those stations,
where they stand on the map now, are the anchors. On every track line of the map:
  * between two neighbouring anchors of the same counting the km runs linearly, so the scheme values are hit exactly
    and the difference between the map's length and the real one is spread over the stretch;
  * past the last anchor it runs on at 1 km per km (up to EXTRAPOLATE_KM);
  * where two countings meet (e.g. the main line and the Angren line) each side runs on to the middle.
Anchors whose neighbours disagree with them by too much (another counting, or a station put in the wrong place) are
left out on that line.
Positions are read from the database, so moving a station on the map recalculates everything within REFRESH seconds.

Admins can correct the marks on the map (data/km_edits.json, survives `python -m app.seed`):
  * a km post or picket dragged to its real place becomes one more anchor ("manual"), so the km around it follows;
  * the next (or previous) km post can be pulled out of a km post and dropped where it really stands: both posts
    become anchors, and the pickets between them divide that stretch evenly;
  * any point of a track can be given its km ("3508+350"): one more anchor. Hand-set anchors win over the scheme's
    stations next to them, and two of them are enough to number a line the scheme does not cover;
  * a mark switched off is shown grey to admins and not at all to other users;
  * a km post deleted (alone or a whole stretch) is shown to nobody, with its pickets; the journal brings it back.

CLI: python -m app.chainage    -> table of the MTU's stations and halts with their km, plus the stretches to check.
"""
import bisect
import functools
import json
import math
import os
import re
import threading
import time

from . import km_fixes
from . import models as m
from . import mtu_toshkent as reg
from .db import SessionLocal

ANCHOR_KM = 0.15          # a station counts as standing on a line when it is this close to it
EXTRAPOLATE_KM = 15       # how far the km runs on past the last anchor of a line
RATIO = (0.25, 2.2)       # km difference / map distance between neighbouring anchors accepted as one counting
REFRESH = 30              # seconds between checks whether stations moved
DEDUP_KM = 1.5            # the same mark on parallel / duplicate lines closer than this is shown once
SAME_MARK_KM = 2          # an edit applies to the marks with the same km value within this distance (parallel lines too)
DELETED_KM = 0.3          # a deleted mark stays deleted while it is counted to (about) the same place; when the km
                          # around is corrected and the mark lands elsewhere, it is a new mark and shows again
MANUAL_WINS_KM = 30       # a hand-set anchor overrules disagreeing scheme stations next to it within this distance
EDITS_FILE = os.path.join(os.getenv("DATA_DIR", "data"), "km_edits.json")


def parse_km(s: str) -> float | None:
    """'3388+309' -> 3388.309, '3346' -> 3346.0, '12 km PK7' -> 12.65 (middle of the picket), '3388,3' -> 3388.3."""
    s = (s or "").strip()
    if re.match(r"^\d+[.,]\d+$", s):
        return float(s.replace(",", "."))
    mm = re.match(r"^(\d+)\s*km\s*PK\s*(\d+)$", s, re.I)
    if mm:
        return int(mm[1]) + (int(mm[2]) - 0.5) / 10
    mm = re.match(r"^(\d+)(?:\s*\+\s*(\d+))?$", s)
    return int(mm[1]) + int(mm[2] or 0) / 1000 if mm else None


def fmt(c: float) -> dict:
    """{'km': 3388, 'm': 309, 'pk': 4, 'text': '3388+309'} for a chainage in km."""
    meters = int(round(c * 1000))
    km, rest = divmod(meters, 1000)
    return {"km": km, "m": rest, "pk": rest // 100 + 1, "text": f"{km}+{rest:03d}"}


def _hav(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[1], a[0], b[1], b[0]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(h))


class _Line:
    """One map line: coordinates, cumulative length, bbox, and (once calibrated) its km pieces."""

    def __init__(self, f):
        self.id = f["properties"]["id"]
        self.title = f["properties"].get("title") or self.id
        self.c = f["geometry"]["coordinates"]
        self.cum = [0.0]
        for a, b in zip(self.c, self.c[1:]):
            self.cum.append(self.cum[-1] + _hav(a, b))
        self.total = self.cum[-1]
        xs, ys = [p[0] for p in self.c], [p[1] for p in self.c]
        self.bbox = (min(xs), min(ys), max(xs), max(ys))
        self.pieces: list[tuple[float, float, float, float]] = []  # (along0, along1, km0, km1), along0 < along1
        self.anchors: list[tuple[float, float, str]] = []

    def near(self, lat, lng, pad):
        return self.bbox[0] - pad <= lng <= self.bbox[2] + pad and self.bbox[1] - pad <= lat <= self.bbox[3] + pad

    def project(self, lat, lng):
        """(distance to the line, km along it from its start)."""
        k = math.cos(math.radians(lat))
        best = (1e9, 0.0)
        for i, (a, b) in enumerate(zip(self.c, self.c[1:])):
            ax, ay, bx, by, px, py = a[0] * k, a[1], b[0] * k, b[1], lng * k, lat
            dx, dy = bx - ax, by - ay
            L2 = dx * dx + dy * dy
            t = 0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
            q = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
            d = _hav(q, (lng, lat))
            if d < best[0]:
                best = (d, self.cum[i] + (self.cum[i + 1] - self.cum[i]) * t)
        return best

    def point(self, along):
        """(lng, lat) at `along` km from the start."""
        i = max(0, min(len(self.c) - 2, bisect.bisect_right(self.cum, along) - 1))
        a, b = self.c[i], self.c[i + 1]
        d = self.cum[i + 1] - self.cum[i]
        t = 0 if d == 0 else (along - self.cum[i]) / d
        return a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t

    def km_at(self, along):
        for a0, a1, c0, c1 in self.pieces:
            if a0 - 1e-9 <= along <= a1 + 1e-9:
                return c0 + (c1 - c0) * ((along - a0) / (a1 - a0) if a1 > a0 else 0)
        return None


def _system(c):  # the main line counts from ~3300 km, the branches from 0
    return "main" if c >= 1000 else "branch"


def _same(p, q):
    (a0, c0, _), (a1, c1, _) = p, q
    if _system(c0) != _system(c1) or a1 <= a0:
        return False
    r = abs(c1 - c0) / (a1 - a0)
    return RATIO[0] <= r <= RATIO[1]


def _meet(p, q, slope):
    """Where two neighbouring anchors of different countings meet: half-way, or, when one of them is a hand-set km of a
    branch whose km 0 lies between them, at that km 0 (a branch starts where it leaves the main line)."""
    for b, o, side in ((q, p, -1), (p, q, 1)):
        s = slope.get(id(b))
        if s and b[2] == "manual" and _system(b[1]) == "branch" and _system(o[1]) != "branch":
            zero = b[0] - b[1] / s  # the km here is b[1] + s * (along - b[0])
            if (zero - b[0]) * side >= 0 and p[0] - 0.05 <= zero <= q[0] + 0.05:
                return zero
    return (p[0] + q[0]) / 2


def _cut(pieces, lo, hi):
    """The pieces without the stretch lo..hi (km along the line)."""
    out = []
    for a0, a1, c0, c1 in pieces:
        km = lambda a: c0 + (c1 - c0) * ((a - a0) / (a1 - a0) if a1 > a0 else 0)  # noqa: E731
        if a1 <= lo or a0 >= hi:
            out.append((a0, a1, c0, c1))
            continue
        if a0 < lo:
            out.append((a0, lo, c0, km(lo)))
        if a1 > hi:
            out.append((hi, a1, km(hi), c1))
    return out


def _calibrate(ln: _Line, anchors):
    """anchors: [(along, km, name)] sorted by along. Fills ln.pieces."""
    an = list(anchors)
    again = True
    while again:  # what an admin set by hand is right: a scheme station next to it that disagrees is left out
        again = False
        for i, x in enumerate(an):
            if x[2] != "manual":
                continue
            for j in (i - 1, i + 1):
                if 0 <= j < len(an) and an[j][2] != "manual" and _system(an[j][1]) == _system(x[1]) \
                        and abs(an[j][0] - x[0]) < MANUAL_WINS_KM and not _same(*sorted((an[j], x))[:2]):
                    del an[j]
                    again = True
                    break
            if again:
                break
    while True:  # drop anchors that agree with neither neighbour, as long as the line has other anchors
        keep = [x for i, x in enumerate(an)
                if (i > 0 and _same(an[i - 1], x)) or (i < len(an) - 1 and _same(x, an[i + 1]))]
        if len(keep) == len(an) or not keep:
            break
        an = keep
    ln.anchors = an
    pieces = []
    if len(an) == 1 or not any(_same(p, q) for p, q in zip(an, an[1:])):
        # a single anchor: the direction is only known when the line plainly starts (or ends) at km 0
        for along, c, _ in an[:1] if len(an) == 1 else []:
            if abs(along - c) < 3:
                pieces.append((0.0, ln.total, c - along, c - along + ln.total))
            elif abs(ln.total - along - c) < 3:
                pieces.append((0.0, ln.total, c + along, c + along - ln.total))
        ln.pieces = pieces
        return
    slope = {}
    for p, q in zip(an, an[1:]):
        if _same(p, q):
            pieces.append((p[0], q[0], p[1], q[1]))
            s = 1 if q[1] > p[1] else -1
            slope.setdefault(id(p), s)
            slope[id(q)] = s
    # past the ends, and towards a neighbouring anchor of another counting (to the middle)
    for i, x in enumerate(an):
        s = slope.get(id(x))
        if s is None:
            continue
        left_ok = i > 0 and _same(an[i - 1], x)
        right_ok = i < len(an) - 1 and _same(x, an[i + 1])
        if not left_ok:
            lo = _meet(an[i - 1], x, slope) if i > 0 else max(0.0, x[0] - EXTRAPOLATE_KM)
            if x[0] > lo:
                pieces.append((lo, x[0], x[1] - s * (x[0] - lo), x[1]))
        if not right_ok:
            hi = _meet(x, an[i + 1], slope) if i < len(an) - 1 else min(ln.total, x[0] + EXTRAPOLATE_KM)
            if hi > x[0]:
                pieces.append((x[0], hi, x[1], x[1] + s * (hi - x[0])))
    ln.pieces = sorted(pieces)


# ---------- state ----------
_lock = threading.Lock()
_state = {"checked": 0.0, "key": None, "lines": None, "area": None, "stations": []}


def _lines_raw():
    from .routers.map_routes import lines_geojson
    return lines_geojson()["features"]


def _scheme_stations(db):
    """[(name on the scheme, km, Station)] for the stations of the scheme that are in the database."""
    out = []
    for name, _sec, km, key in reg.STATIONS:
        c = parse_km(km)
        s = (db.query(m.Station).filter(m.Station.esr_code == reg.CODES.get(key, key)).first()
             or db.query(m.Station).filter(m.Station.name == name).first())
        if c is not None and s:
            out.append((name, c, s))
    return out


# ---------- admin edits ----------
_edits_lock = threading.RLock()  # one admin edit at a time: each is read - change - write of the whole file


def _writer(fn):
    @functools.wraps(fn)
    def run(*a, **kw):
        with _edits_lock:
            return fn(*a, **kw)
    return run


def load_edits(strict: bool = False) -> dict:
    """strict (before a write): a file that cannot be read is an error, not "no edits" - else the write would wipe it."""
    try:
        with open(EDITS_FILE, encoding="utf-8") as f:
            e = json.load(f)
    except FileNotFoundError:
        e = {}
    except (OSError, ValueError):
        if strict:
            raise
        e = {}
    out = {k: [x for x in e.get(k, []) if isinstance(x, dict)] for k in ("anchors", "hidden", "deleted")}
    seen, once = set(), []
    for x in out["deleted"]:  # the same mark deleted twice is one deletion
        k = (x["km"], x["lat"], x["lng"])
        if k not in seen:
            seen.add(k)
            once.append(x)
    out["deleted"] = once
    return out


def _save_edits(e: dict):
    os.makedirs(os.path.dirname(EDITS_FILE) or ".", exist_ok=True)
    tmp = EDITS_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(e, f, ensure_ascii=False, indent=1)
    os.replace(tmp, EDITS_FILE)  # readers see the old file or the new one, never a half-written one
    with _lock:
        _state["checked"] = 0.0  # recalculate on the next request


def _same_mark(x: dict, km: float, lat: float, lng: float) -> bool:
    return abs(x["km"] - km) < 1e-6 and _hav((x["lng"], x["lat"]), (lng, lat)) < SAME_MARK_KM


def _index(items) -> dict:
    """{km: [(lng, lat)]}: marks() asks about thousands of marks, a plain list would be scanned for each."""
    out = {}
    for x in items:
        out.setdefault(round(x["km"], 3), []).append((x["lng"], x["lat"]))
    return out


def _hit(idx: dict, km: float, lat: float, lng: float, dist: float = SAME_MARK_KM) -> bool:
    return any(_hav(p, (lng, lat)) < dist for p in idx.get(round(km, 3), ()))


def snap(lat: float, lng: float, max_km: float = 0.5):
    """Nearest point of any map line: (lat, lng), or None when no line is that close."""
    best = None
    for ln in state()["lines"].values():
        if not ln.near(lat, lng, 0.01):
            continue
        d, along = ln.project(lat, lng)
        if d <= max_km and (best is None or d < best[0]):
            best = (d, ln.point(along))
    return (best[1][1], best[1][0]) if best else None


@_writer
def set_anchor(km: float, lat: float, lng: float) -> dict | None:
    """Puts km post `km` at the point of the track nearest to lat/lng (replacing the earlier place of that post)."""
    p = snap(lat, lng)
    if not p:
        return None
    e = load_edits(strict=True)
    old = [x for x in e["anchors"] if abs(x["km"] - km) < 1e-6 and _hav((x["lng"], x["lat"]), (lng, lat)) < 15]
    e["anchors"] = [x for x in e["anchors"] if x not in old] + [{"km": km, "lat": round(p[0], 7), "lng": round(p[1], 7)}]
    e["deleted"] = [x for x in e["deleted"] if not _same_mark(x, km, p[0], p[1])]
    _save_edits(e)
    got = at(p[0], p[1], 0.05)  # None: the line needs one more hand-set km to know which way the km runs
    return {"km": km, "lat": p[0], "lng": p[1], "counted": got is not None and abs(got - km) < 0.05}


def _posts(line_id: str, values, g: int) -> list[dict]:
    """Where the km posts `values` stand on a line now, as records of deleted marks."""
    ln = calibrated(line_id)
    out = []
    for a0, a1, c0, c1 in (ln.pieces if ln else []):
        if c0 == c1:
            continue
        for v in values:
            if v < 0 or not min(c0, c1) - 1e-9 <= v <= max(c0, c1) + 1e-9:
                continue
            plng, plat = ln.point(a0 + (a1 - a0) * (v - c0) / (c1 - c0))
            if not any(x["km"] == v and _hav((x["lng"], x["lat"]), (plng, plat)) < 0.05 for x in out):
                out.append({"km": v, "lat": round(plat, 7), "lng": round(plng, 7), "g": g})
    return out


@_writer
def delete_marks(line_id: str, c_from: float, c_to: float, lat: float, lng: float) -> int:
    """Deletes km posts c_from..c_to of a line (each with its pickets), or one picket when c_from is not a whole km."""
    lo, hi = sorted((c_from, c_to))
    g = int(time.time() * 1000)
    if lo == hi and abs(lo - round(lo)) > 1e-6:
        values = [round(lo, 1)]
        new = [{"km": values[0], "lat": round(lat, 7), "lng": round(lng, 7), "g": g}]
    else:
        if hi - lo > 1000:
            return 0
        values = list(range(math.ceil(lo - 1e-9), math.floor(hi + 1e-9) + 1))
        new = _posts(line_id, values, g)
    if not new:
        return 0
    e = load_edits(strict=True)
    # deleting a mark set by hand takes that hand-set km away too: nothing invisible keeps steering the count
    hand = [a for a in e["anchors"] if any(_same_mark(a, x["km"], x["lat"], x["lng"]) for x in new)]
    found = len(new)
    if hand:
        e["anchors"] = [a for a in e["anchors"] if a not in hand]
        _save_edits(e)
        # without the hand-set place these km are counted to another spot: they are deleted there as well
        new += _posts(line_id, values, g)
        e = load_edits(strict=True)
    have = {(x["km"], x["lat"], x["lng"]) for x in e["deleted"]}
    for x in new:
        if (x["km"], x["lat"], x["lng"]) not in have:
            have.add((x["km"], x["lat"], x["lng"]))
            e["deleted"].append(x)
    _save_edits(e)
    return found


@_writer
def restore_marks(g: int | None = None) -> int:
    """Brings back the marks deleted in one go (g), or all deleted marks."""
    e = load_edits()
    keep = [x for x in e["deleted"] if g is not None and x.get("g") != g]
    n = len(e["deleted"]) - len(keep)
    if n:
        e["deleted"] = keep
        _save_edits(e)
    return n


@_writer
def reset_edits():
    _save_edits({"anchors": [], "hidden": [], "deleted": []})


def journal() -> list[dict]:
    """Everything admins changed by hand, for the editor: hand-set km, hidden marks, deleted stretches."""
    e = load_edits()
    out = [{"type": "anchor", "km": x["km"], "text": fmt(x["km"])["text"], "lat": x["lat"], "lng": x["lng"]} for x in e["anchors"]]
    out += [{"type": "hidden", "km": x["km"], "text": fmt(x["km"])["text"], "lat": x["lat"], "lng": x["lng"]} for x in e["hidden"]]
    groups = {}
    for x in e["deleted"]:
        groups.setdefault(x.get("g"), []).append(x)
    for g, xs in groups.items():
        xs.sort(key=lambda x: x["km"])
        mid = xs[len(xs) // 2]
        whole = abs(xs[0]["km"] - round(xs[0]["km"])) < 1e-6
        out.append({"type": "deleted", "g": g, "count": len(xs), "km": xs[0]["km"], "lat": mid["lat"], "lng": mid["lng"],
                    "text": (f"{xs[0]['km']:g}" + (f"–{xs[-1]['km']:g}" if xs[-1]["km"] != xs[0]["km"] else "")) if whole else fmt(xs[0]["km"])["text"]})
    return out


PULL_KM = (0.5, 3.5)       # map length accepted for one km pulled out by hand (kept inside RATIO)


@_writer
def pull(km: float, lat: float, lng: float, to_lat: float, to_lng: float, step: int):
    """Km post `km` stands at lat/lng; puts post km+step (step = 1 or -1) where the admin dropped it, on the same line.
    Both become anchors. Returns the new post, or an error code."""
    best = None
    for ln in state()["lines"].values():
        if not ln.pieces or not ln.near(lat, lng, 0.01) or not ln.near(to_lat, to_lng, 0.01):
            continue
        d0, a0 = ln.project(lat, lng)
        d1, a1 = ln.project(to_lat, to_lng)
        if d0 <= ANCHOR_KM and d1 <= 0.5 and (best is None or d1 < best[0]):
            best = (d1, ln, a0, a1)
    if not best:
        return "too_far_from_track"
    _, ln, a0, a1 = best
    piece = next((p for p in ln.pieces if p[0] - 1e-6 <= a0 <= p[1] + 1e-6 and p[2] != p[3]), None)
    if not piece:
        return "too_far_from_track"
    s = 1 if piece[3] > piece[2] else -1  # the km grows (1) or falls (-1) along the line here
    new = km + step
    if (a1 - a0) * s * step <= 0:
        return "wrong_side"
    if not PULL_KM[0] <= abs(a1 - a0) <= PULL_KM[1]:
        return "bad_distance"
    for along, c, _name in ln.anchors:  # the new post must not jump over a neighbouring station / hand-set post
        if abs(along - a1) < 10 and _system(c) == _system(km) and abs(c - new) > 1e-6 and abs(c - km) > 1e-6 \
                and (along - a1) * s * (c - new) < 0:
            return "wrong_side"
    e = load_edits()
    pts = [(km, ln.point(a0)), (new, ln.point(a1))]
    for c, (plng, plat) in pts:
        e["anchors"] = [x for x in e["anchors"]
                        if not (abs(x["km"] - c) < 1e-6 and _hav((x["lng"], x["lat"]), (plng, plat)) < 15)]
        e["anchors"].append({"km": c, "lat": round(plat, 7), "lng": round(plng, 7)})
        e["deleted"] = [x for x in e["deleted"] if not _same_mark(x, c, plat, plng)]
    _save_edits(e)
    return {"km": new, "lat": pts[1][1][1], "lng": pts[1][1][0], "lengthKm": round(abs(a1 - a0), 3)}


@_writer
def remove_anchor(km: float, lat: float, lng: float) -> bool:
    e = load_edits()
    keep = [x for x in e["anchors"] if not _same_mark(x, km, lat, lng)]
    if len(keep) == len(e["anchors"]):
        return False
    e["anchors"] = keep
    _save_edits(e)
    return True


@_writer
def set_hidden(km: float, lat: float, lng: float, hidden: bool):
    e = load_edits()
    e["hidden"] = [x for x in e["hidden"] if not _same_mark(x, km, lat, lng)]
    if hidden:
        e["hidden"].append({"km": km, "lat": round(lat, 7), "lng": round(lng, 7)})
    _save_edits(e)


def _build():
    with SessionLocal() as db:
        st = [(n, c, s.id, s.lat, s.lng) for n, c, s in _scheme_stations(db)]
    edits = load_edits()
    manual = [("manual", x["km"], None, x["lat"], x["lng"]) for x in edits["anchors"]]
    # the project's own known points; an admin's mark with the same km nearby replaces such a point
    manual += [("manual", c, None, la, lo) for c, la, lo in km_fixes.ANCHORS
               if not any(abs(x["km"] - c) < 1e-6 and _hav((x["lng"], x["lat"]), (lo, la)) < 15 for x in edits["anchors"])]
    _state["edits"] = edits
    _state["idx"] = {k: _index(v) for k, v in edits.items()}
    key = tuple((n, c, round(la, 6), round(lo, 6)) for n, c, _, la, lo in st + manual)
    if key == _state["key"] and _state["lines"] is not None:
        return
    lines = [_Line(f) for f in _lines_raw() if len(f["geometry"]["coordinates"]) > 1]
    for ln in lines:
        an = []
        for n, c, _sid, la, lo in st + manual:
            if ln.near(la, lo, 0.01):
                d, along = ln.project(la, lo)
                if d <= ANCHOR_KM:
                    an.append((along, c, n))
        if an:
            _calibrate(ln, sorted(an))
        for la1, lo1, la2, lo2 in km_fixes.NO_KM:
            if ln.pieces and ln.near(la1, lo1, 0.01) and ln.near(la2, lo2, 0.01):
                (d1, a1), (d2, a2) = ln.project(la1, lo1), ln.project(la2, lo2)
                if d1 <= ANCHOR_KM and d2 <= ANCHOR_KM:
                    ln.pieces = _cut(ln.pieces, *sorted((a1, a2)))
    lats, lngs = [x[3] for x in st], [x[4] for x in st]
    area = (min(lngs) - 0.15, min(lats) - 0.15, max(lngs) + 0.15, max(lats) + 0.15) if st else None
    _state.update(key=key, lines={ln.id: ln for ln in lines}, area=area, stations=st)


def state():
    with _lock:
        if time.time() - _state["checked"] > REFRESH or _state["lines"] is None:
            _build()
            _state["checked"] = time.time()
    return _state


def in_area(lng, lat) -> bool:
    a = state()["area"]
    return bool(a) and a[0] <= lng <= a[2] and a[1] <= lat <= a[3]


def calibrated(line_id: str) -> _Line | None:
    ln = state()["lines"].get(line_id)
    return ln if ln and ln.pieces else None


def marks(step: float, bbox=None, limit=6000) -> list[dict]:
    """Km posts (step 1 or 10) or pickets (step 0.1) on the calibrated lines."""
    out, seen = [], {}
    n = round(1 / step) if step < 1 else 1
    idx = state().get("idx") or {}
    manual, hidden, deleted = (idx.get(k, {}) for k in ("anchors", "hidden", "deleted"))
    for ln in state()["lines"].values():
        if bbox and not (ln.bbox[0] <= bbox[2] and ln.bbox[2] >= bbox[0] and ln.bbox[1] <= bbox[3] and ln.bbox[3] >= bbox[1]):
            continue
        for a0, a1, c0, c1 in ln.pieces:
            lo, hi = sorted((c0, c1))
            first = math.ceil(lo / step - 1e-6)  # (a branch cut at its km 0 starts a hair above 0)
            for k in range(first, math.floor(hi / step + 1e-6) + 1):
                c = k * step
                if c < 0:
                    continue
                along = a0 + (a1 - a0) * ((c - c0) / (c1 - c0) if c1 != c0 else 0)
                lng, lat = ln.point(along)
                if bbox and not (bbox[0] <= lng <= bbox[2] and bbox[1] <= lat <= bbox[3]):
                    continue
                km, pk = (k // n, k % n) if step < 1 else (int(round(c)), 0)
                label = f"{km}" if not pk else f"PK{pk}"  # picket post at +pk*100 m
                value = round(c, 1)  # (not c1: that is the piece's end km, used by the loop above)
                is_manual = _hit(manual, value, lat, lng)
                if deleted and not is_manual:
                    if _hit(deleted, value, lat, lng, DELETED_KM):
                        continue
                    if pk and km in deleted and c1 != c0:  # a picket goes with its km post: where is that post on this line?
                        plng, plat = ln.point(a0 + (a1 - a0) * (km - c0) / (c1 - c0))
                        if _hit(deleted, km, plat, plng, DELETED_KM):
                            continue
                dup = seen.setdefault((km, pk), [])
                if any(_hav((lng, lat), p) < DEDUP_KM for p in dup):
                    continue
                dup.append((lng, lat))
                out.append({"line": ln.id, "km": value, "label": label, "lat": lat, "lng": lng,
                            "manual": is_manual, "hidden": _hit(hidden, value, lat, lng)})
                if len(out) >= limit:
                    return out
    if step <= 2:  # a km set by hand between the marks ("3508+676") is shown where it was set
        for x in (state().get("edits") or {}).get("anchors", []):
            c = x["km"]
            if abs(c / step - round(c / step)) < 1e-6:
                continue  # it is one of the marks above
            if bbox and not (bbox[0] <= x["lng"] <= bbox[2] and bbox[1] <= x["lat"] <= bbox[3]):
                continue
            out.append({"line": None, "km": c, "label": fmt(c)["text"], "lat": x["lat"], "lng": x["lng"],
                        "manual": True, "hidden": False, "anchor": True})
    return out


def at(lat: float, lng: float, max_km: float = 0.5) -> float | None:
    """Km post of a point near a calibrated line, or None."""
    best = None
    for ln in state()["lines"].values():
        if not ln.pieces or not ln.near(lat, lng, 0.01):
            continue
        d, along = ln.project(lat, lng)
        c = ln.km_at(along)
        if d <= max_km and c is not None and (best is None or d < best[0]):
            best = (d, c)
    return best[1] if best else None


def station_km(s: m.Station) -> dict | None:
    """{'text', 'km', 'pk', 'source': 'scheme'|'computed'} for a station, or None."""
    for n, c, sid, _la, _lo in state()["stations"]:
        if sid == s.id:
            return {**fmt(c), "source": "scheme"}
    c = at(s.lat, s.lng)
    return {**fmt(c), "source": "computed"} if c is not None else None


def km_range(line_id: str):
    ln = calibrated(line_id)
    if not ln:
        return None
    cs = [c for p in ln.pieces for c in p[2:]]
    if len({_system(c) for c in cs}) > 1:
        return None  # two countings meet on this line: one range would mislead
    return max(0.0, min(cs)), max(cs)


def path(line_id: str, c_from: float, c_to: float, step: float = 0.1) -> list[list[float]]:
    """[[lat, lng], ...] of a calibrated line between two km posts (empty when the line does not reach them)."""
    ln = calibrated(line_id)
    if not ln:
        return []
    lo, hi = sorted((c_from, c_to))
    pts = []
    for a0, a1, c0, c1 in ln.pieces:
        if max(c0, c1) < lo or min(c0, c1) > hi or c0 == c1:
            continue
        f = lambda c: a0 + (a1 - a0) * (c - c0) / (c1 - c0)  # noqa: E731
        s, e = sorted((f(max(lo, min(c0, c1))), f(min(hi, max(c0, c1)))))
        k = s
        while k < e:
            pts.append(ln.point(k))
            k += step
        pts.append(ln.point(e))
    return [[p[1], p[0]] for p in pts]


# ---------- review ----------
def report() -> str:
    st = state()
    rows, warn = [], []
    for ln in st["lines"].values():
        for p, q in zip(ln.anchors, ln.anchors[1:]):
            if _same(p, q):
                r = abs(q[1] - p[1]) / (q[0] - p[0])
                if not 0.9 <= r <= 1.1:
                    warn.append(f"  {p[2]} → {q[2]}: по схеме {abs(q[1] - p[1]):.2f} км, по карте {q[0] - p[0]:.2f} км (линия {ln.id})")
    with SessionLocal() as db:
        mtu = db.query(m.Mtu).filter(m.Mtu.code == reg.MTU_CODE).first()
        for s in db.query(m.Station).filter(m.Station.mtu_id == mtu.id).order_by(m.Station.name).all():
            k = station_km(s)
            rows.append(f"  {s.name[:28]:28} {s.esr_code:8} {(k['text'] + ' ПК' + str(k['pk'])) if k else '—':16} "
                        f"{({'scheme': 'схема', 'computed': 'расчёт'}[k['source']]) if k else 'не на размеченной линии'}")
    cal = sum(1 for ln in st["lines"].values() if ln.pieces)
    return "\n".join([f"Размечено линий: {cal}", "", "Станции и пункты МТУ:", *rows, "",
                      "Расхождения схемы и карты больше 10% (проверьте место станции):", *(dict.fromkeys(warn) or ["  нет"])])


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    print(report())
