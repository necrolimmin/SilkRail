"""Import real railway geometry & stations for Uzbekistan from OpenStreetMap (Overpass API).

Data © OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright

Run once (needs internet):  python -m app.osm_import
Produces:
  data/osm_stations.json   stations/halts with ESR codes, snapped to the track
  data/osm_rails.json      merged + simplified track polylines [{e: electrified, u: usage, pts: [[lat,lng],...]}]
The seed (python -m app.seed) uses these files when present.
"""
import json
import math
import os
import sys
import urllib.parse
import urllib.request

DATA_DIR = os.getenv("DATA_DIR", "data")
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
AREA = 'area["ISO3166-1"="UZ"][admin_level=2]->.a;'
# stations, halts and yards; ways/areas are returned with their centre point
Q_STATIONS = f'[out:json][timeout:180];{AREA}nwr[railway~"^(station|halt|yard)$"](area.a);out center tags;'
# every track except yard/siding/crossover pieces (spurs & industrial lines are kept, short ones only for snapping)
Q_RAILS = f'[out:json][timeout:300];{AREA}way[railway~"^(rail|narrow_gauge)$"][service!~"^(yard|siding|crossover)$"](area.a);out tags geom;'
EXCLUDED_STATION = {"subway", "light_rail", "monorail", "tram", "funicular"}
MIN_DISPLAY_KM = {"main": 0.15, "branch": 0.15, "spur": 2.0}


def overpass(query: str) -> list[dict]:
    last = None
    for url in ENDPOINTS:
        try:
            print(f"  → {url}")
            data = urllib.parse.urlencode({"data": query}).encode()
            req = urllib.request.Request(url, data=data, headers={"User-Agent": "SilkRail/1.0 (osm import)"})
            with urllib.request.urlopen(req, timeout=300) as r:
                return json.loads(r.read().decode("utf-8"))["elements"]
        except Exception as e:  # try next mirror
            last = e
            print(f"    failed: {e}")
    raise RuntimeError(f"Overpass unavailable: {last}")


# ---------------- geometry helpers ----------------
def dist_m(a, b):
    """Haversine distance in metres between [lat,lng] points."""
    R = 6371000.0
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def project(p, a, b):
    """Closest point to p on segment a-b (planar approx, fine at these scales). Returns (point, t)."""
    k = math.cos(math.radians(p[0]))
    ax, ay, bx, by, px, py = a[1] * k, a[0], b[1] * k, b[0], p[1] * k, p[0]
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0.0 if L == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L))
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], t


def simplify(pts, eps):
    """Douglas–Peucker in degrees."""
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    dx, dy = b[1] - a[1], b[0] - a[0]
    n = math.hypot(dx, dy) or 1e-12
    dmax, idx = 0.0, 0
    for i in range(1, len(pts) - 1):
        p = pts[i]
        d = abs(dy * (p[1] - a[1]) - dx * (p[0] - a[0])) / n
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        return simplify(pts[: idx + 1], eps)[:-1] + simplify(pts[idx:], eps)
    return [a, b]


def chain(segs):
    """Merge segments that share an endpoint (degree-2 nodes) and have the same attributes."""
    def k(p):
        return f"{p[0]:.5f},{p[1]:.5f}"
    changed = True
    while changed:
        changed = False
        ends = {}
        for i, s in enumerate(segs):
            for side in (0, 1):
                p = s["pts"][-1] if side else s["pts"][0]
                ends.setdefault((s["e"], s["u"], k(p)), []).append((i, side))
        used, out = set(), []
        for arr in ends.values():
            if len(arr) != 2:
                continue
            (i, si), (j, sj) = arr
            if i == j or i in used or j in used:
                continue
            a, b = segs[i]["pts"][:], segs[j]["pts"][:]
            if si == 0:
                a.reverse()
            if sj == 1:
                b.reverse()
            out.append({"e": segs[i]["e"], "u": segs[i]["u"], "pts": a + b[1:]})
            used.update((i, j))
            changed = True
        out += [s for i, s in enumerate(segs) if i not in used]
        segs = out
    return segs


def process(raw_stations: list[dict], raw_ways: list[dict]):
    segs = []
    for w in raw_ways:
        t = w.get("tags", {})
        if not w.get("geometry"):
            continue
        usage = t.get("usage", "main")
        u = "spur" if (t.get("service") or usage in ("industrial", "freight", "tourism")) else ("branch" if usage == "branch" else "main")
        e = 1 if t.get("electrified") not in (None, "no") else 0
        segs.append({"e": e, "u": u,
                     "pts": [[round(g["lat"], 6), round(g["lon"], 6)] for g in w["geometry"]]})
    segs = chain(segs)
    rails, snap_only = [], []
    for s in segs:
        pts = simplify(s["pts"], 0.00025)  # ~25 m tolerance keeps curves
        length = sum(dist_m(a, b) for a, b in zip(pts, pts[1:]))
        item = {"e": s["e"], "u": s["u"], "len": round(length), "pts": [[round(p[0], 5), round(p[1], 5)] for p in pts]}
        (rails if length >= MIN_DISPLAY_KM[s["u"]] * 1000 else snap_only).append(item)

    # spatial grid for snapping
    cell = 0.05
    grid = {}
    for ri, r in enumerate(rails):
        for si, (a, b) in enumerate(zip(r["pts"], r["pts"][1:])):
            for gx in range(int(min(a[0], b[0]) / cell), int(max(a[0], b[0]) / cell) + 1):
                for gy in range(int(min(a[1], b[1]) / cell), int(max(a[1], b[1]) / cell) + 1):
                    grid.setdefault((gx, gy), []).append((ri, si))

    def snap(p):
        best = (None, 1e18, None, None)
        gx, gy = int(p[0] / cell), int(p[1] / cell)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for ri, si in grid.get((gx + dx, gy + dy), ()):
                    a, b = rails[ri]["pts"][si], rails[ri]["pts"][si + 1]
                    q, _ = project(p, a, b)
                    d = dist_m(p, q)
                    if d < best[1]:
                        best = (q, d, ri, si)
        return best

    def add_to_grid(ri):
        r = rails[ri]
        for si, (a, b) in enumerate(zip(r["pts"], r["pts"][1:])):
            for gx in range(int(min(a[0], b[0]) / cell), int(max(a[0], b[0]) / cell) + 1):
                for gy in range(int(min(a[1], b[1]) / cell), int(max(a[1], b[1]) / cell) + 1):
                    grid.setdefault((gx, gy), []).append((ri, si))

    def nearest_short(p):
        best = (None, 1e18)
        for k, r in enumerate(snap_only):
            if not r:
                continue
            for a, b in zip(r["pts"], r["pts"][1:]):
                if abs(a[0] - p[0]) > .05 or abs(a[1] - p[1]) > .05:
                    continue
                q, _ = project(p, a, b)
                d = dist_m(p, q)
                if d < best[1]:
                    best = (k, d)
        return best

    stations, seen, skipped = [], set(), []
    for n in raw_stations:
        t = n.get("tags", {})
        if t.get("station") in EXCLUDED_STATION or t.get("subway") == "yes" or t.get("light_rail") == "yes":
            continue
        name = t.get("name:uz") or t.get("name") or t.get("name:ru")
        lat, lon = (n.get("lat"), n.get("lon")) if "lat" in n else (n.get("center", {}).get("lat"), n.get("center", {}).get("lon"))
        if not name or lat is None:
            continue
        p = [lat, lon]
        q, d, ri, si = snap(p)
        if q is None or d > 300:
            k, dk = nearest_short(p)
            if k is not None and dk < min(d, 1500):
                rails.append(snap_only[k])
                snap_only[k] = None
                add_to_grid(len(rails) - 1)
                q, d, ri, si = snap(p)
        if q is None or d > 1500:  # not on the network
            skipped.append({"name": name, "lat": lat, "lng": lon, "dist": None if q is None else round(d)})
            continue
        key = (name, round(q[0] / 0.003), round(q[1] / 0.003))
        if key in seen:
            continue
        seen.add(key)
        esr = t.get("esr:user") or t.get("esr") or t.get("railway:ref") or ""
        stations.append({"osm": n["id"], "name": name.strip(), "nameRu": t.get("name:ru") or name, "esr": esr[:6],
                         "kind": {"halt": "halt", "yard": "yard"}.get(t.get("railway"), "station"),
                         "lat": round(q[0], 6), "lng": round(q[1], 6), "rail": ri, "offset": round(d)})
    if skipped:
        print(f"  skipped {len(skipped)} station(s) farther than 1.5 km from any track:",
              ", ".join(x["name"] for x in skipped[:15]))
    return stations, rails


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    print("Downloading stations from OpenStreetMap…")
    st = overpass(Q_STATIONS)
    print(f"  {len(st)} nodes")
    print("Downloading railway tracks (may take ~30 s)…")
    ways = overpass(Q_RAILS)
    print(f"  {len(ways)} ways")
    stations, rails = process(st, ways)
    with open(os.path.join(DATA_DIR, "osm_stations.json"), "w", encoding="utf-8") as f:
        json.dump(stations, f, ensure_ascii=False)
    with open(os.path.join(DATA_DIR, "osm_rails.json"), "w", encoding="utf-8") as f:
        json.dump(rails, f)
    km = sum(r["len"] for r in rails) / 1000
    print(f"Saved {len(stations)} stations and {len(rails)} track polylines ({km:.0f} km incl. parallel tracks).")
    print("Now run:  python -m app.seed")


if __name__ == "__main__":
    sys.exit(main())
