"""Railway network used by the seed: real OSM geometry when available, synthetic fallback otherwise.

build_network() -> (stations, lines)
  stations: [{name, nameRu, esr, lat, lng, mtu, hub, kind, line}]
  lines:    [{id, title, electrified, optic, usage, path: [(lat, lng), ...]}]
"""
import json
import math
import os
import random
import re

from .geo import MTUS, LINES, INTERMEDIATE_PREFIX

DATA_DIR = os.getenv("DATA_DIR", "data")

# anchor stations for assigning regional nodes (nearest anchor wins)
MTU_ANCHORS = {
    "MTU-1": [(41.29, 69.28), (40.49, 68.78), (40.12, 67.84), (41.01, 70.14)],   # Toshkent, Guliston, Jizzax, Angren
    "MTU-2": [(40.53, 70.94), (40.78, 72.34), (41.00, 71.67), (40.38, 71.78)],   # Qo'qon, Andijon, Namangan, Farg'ona
    "MTU-3": [(39.72, 64.55), (40.10, 65.37), (39.65, 66.96), (42.16, 63.55)],   # Kogon, Navoiy, Samarqand, Uchquduq
    "MTU-4": [(43.05, 58.84), (42.46, 59.60), (41.55, 60.63), (43.97, 57.47)],   # Qo'ng'irot, Nukus, Urganch, Jasliq
    "MTU-5": [(38.86, 65.79), (39.25, 65.15), (39.06, 66.83), (38.62, 66.25)],   # Qarshi, Muborak, Shahrisabz, G'uzor
    "MTU-6": [(37.22, 67.28), (38.00, 67.79), (38.27, 67.90), (37.83, 67.58)],   # Termiz, Sho'rchi, Denov, Qumqo'rg'on
}

HUB_PATTERNS = [
    r"^toshkent(-yo.lovchi|-janubiy|-tovarniy)?$", r"^ташкент", r"^samarqand$", r"^buxoro ?1$", r"^kogon$", r"^navoiy$",
    r"^qarshi$", r"^termiz$", r"^qo.qon ?1?$", r"^andijon ?1$", r"^farg.ona ?1?$", r"^namangan$", r"^nukus$",
    r"^qo.ng.irot$", r"^urganch$", r"^xovos$", r"^angren$", r"^jizzax$", r"^guliston$", r"^pop$", r"^marg.ilon$",
    r"^uchquduq$", r"^miskin$", r"^bekobod$", r"^sho.rchi$", r"^denov$", r"^g.uzor$", r"^tinchlik$", r"^zarafshon$",
    r"^oqoltin$", r"^xiva$", r"^to.rtko.l$", r"^jasliq$", r"^muborak$", r"^kitob$", r"^chuqursoy$",
]


def _norm(s: str) -> str:
    return re.sub(r"[ʻʼ’‘`']", "'", s.strip().lower())


def is_hub(name: str) -> bool:
    n = _norm(name)
    return any(re.search(p, n) for p in HUB_PATTERNS)


def mtu_for(lat: float, lng: float) -> str:
    best, code = 1e9, "MTU-1"
    for c, anchors in MTU_ANCHORS.items():
        for a in anchors:
            d = (a[0] - lat) ** 2 + ((a[1] - lng) * math.cos(math.radians(lat))) ** 2
            if d < best:
                best, code = d, c
    return code


def dist_km(a, b):
    R = 6371.0
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def _from_osm():
    sp, rp = os.path.join(DATA_DIR, "osm_stations.json"), os.path.join(DATA_DIR, "osm_rails.json")
    if not (os.path.exists(sp) and os.path.exists(rp)):
        return None
    with open(sp, encoding="utf-8") as f:
        raw_st = json.load(f)
    with open(rp, encoding="utf-8") as f:
        rails = json.load(f)

    lines = []
    for i, r in enumerate(rails):
        lines.append({"id": f"R{i}", "electrified": bool(r["e"]), "optic": r["u"] == "main", "usage": r["u"],
                      "length": r.get("len", 0), "path": [tuple(p) for p in r["pts"]], "title": None})
    stations = []
    for s in raw_st:
        stations.append({"name": s["name"], "nameRu": s.get("nameRu") or s["name"], "esr": s.get("esr") or "",
                         "lat": s["lat"], "lng": s["lng"], "mtu": mtu_for(s["lat"], s["lng"]),
                         "hub": s.get("kind", "station") == "station" and is_hub(s["name"]), "kind": s.get("kind", "station"),
                         "line": f"R{s['rail']}"})
    # manually added stations (from the map UI) survive re-seeding
    cp = os.path.join(DATA_DIR, "custom_stations.json")
    if os.path.exists(cp):
        with open(cp, encoding="utf-8") as f:
            for c in json.load(f):
                stations.append({"name": c["name"], "nameRu": c["name"], "esr": c.get("esr") or "", "lat": c["lat"], "lng": c["lng"],
                                 "mtu": mtu_for(c["lat"], c["lng"]), "hub": False, "kind": c.get("kind", "station"), "line": "-"})
    # titles: nearest stations to both ends of every line
    for ln in lines:
        a, b = ln["path"][0], ln["path"][-1]
        na = min(stations, key=lambda s: dist_km(a, (s["lat"], s["lng"])))
        nb = min(stations, key=lambda s: dist_km(b, (s["lat"], s["lng"])))
        ln["title"] = na["name"] if na is nb else f"{na['name']} — {nb['name']}"
    return stations, lines


def _synthetic(rng: random.Random):
    stations, lines, seen, counter = [], [], set(), 100
    for line_id, title, elec, optic, pts in LINES:
        path = []
        for i, (name, lat, lng, mtu_code, hub) in enumerate(pts):
            if name not in seen:
                seen.add(name)
                stations.append({"name": name, "nameRu": name, "esr": "", "lat": lat, "lng": lng, "mtu": mtu_code,
                                 "hub": hub, "kind": "station", "line": line_id})
            path.append((lat, lng))
            if i < len(pts) - 1:
                nxt = pts[i + 1]
                n_mid = max(1, int(math.hypot(nxt[2] - lng, nxt[1] - lat) / 0.2))
                for k in range(1, n_mid + 1):
                    t = k / (n_mid + 1)
                    la, lo = lat + (nxt[1] - lat) * t, lng + (nxt[2] - lng) * t
                    path.append((la, lo))
                    counter += 1
                    stations.append({"name": f"{rng.choice(INTERMEDIATE_PREFIX)} {counter}", "nameRu": "", "esr": "",
                                     "lat": la, "lng": lo, "mtu": mtu_code if t < .5 else nxt[3], "hub": False,
                                     "kind": "station", "line": line_id})
        lines.append({"id": line_id, "title": title, "electrified": elec, "optic": optic, "usage": "main",
                      "length": sum(dist_km(a, b) for a, b in zip(path, path[1:])) * 1000, "path": path})
    return stations, lines


def build_network(rng: random.Random, auto_import: bool = True):
    net = _from_osm()
    if net is None and auto_import and os.getenv("SKIP_OSM") != "1":
        try:
            from . import osm_import
            print("OSM data not found — importing from OpenStreetMap…")
            osm_import.main()
            net = _from_osm()
        except Exception as e:
            print(f"OSM import failed ({e}); using synthetic network.")
    if net is None:
        print("Using synthetic railway network (run `python -m app.osm_import` for real geometry).")
        return _synthetic(rng) + ("synthetic",)
    return net + ("osm",)
