"""Bring the stations of an MTU in line with its official scheme (see mtu_toshkent.py).

    python -m app.sync_mtu            show what would change, touch nothing
    python -m app.sync_mtu --apply    apply (a copy of the SQLite database and of map_edits.json is made first)

For every station of the registry: name as on the scheme, MTU set explicitly, `mtu_listed` on, drawn as a station.
Stations of the registry that are missing are created. Nothing is ever deleted: other points of the MTU simply
stay unlisted. Runs at the end of `python -m app.seed` too; there it does not override a name an admin has typed on the map.
"""
import math
import os
import shutil
import sys
import time

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from . import models as m
from . import mtu_toshkent
from .routers.map_routes import EDITS_FILE, _hav, _snap_to_lines, _store_edits, lines_geojson, load_edits

REGISTRIES = [mtu_toshkent]


def _chainage(coords, lat, lng):
    """(km from the start of the polyline to the point nearest to lat/lng, distance to it in km)."""
    best, acc, k = (0.0, 1e9), 0.0, math.cos(math.radians(lat))
    for a, b in zip(coords, coords[1:]):
        if abs(a[1] - lat) > .3 and abs(b[1] - lat) > .3:
            acc += _hav(a, b)
            continue
        d = _hav(a, b)
        dx, dy = b[0] - a[0], b[1] - a[1]
        L2 = dx * dx * k * k + dy * dy
        t = 0 if L2 == 0 else max(0, min(1, ((lng - a[0]) * dx * k * k + (lat - a[1]) * dy) / L2))
        off = _hav((lng, lat), (a[0] + dx * t, a[1] + dy * t))
        if off < best[1]:
            best = (acc + d * t, off)
        acc += d
    return best


def _at(coords, km):
    acc = 0.0
    for a, b in zip(coords, coords[1:]):
        d = _hav(a, b)
        if acc + d >= km and d > 0:
            t = (km - acc) / d
            return a[1] + (b[1] - a[1]) * t, a[0] + (b[0] - a[0]) * t
        acc += d
    return coords[-1][1], coords[-1][0]


def _place(a: m.Station, b: m.Station, frac: float):
    """Point `frac` of the way from station a to station b (may lie beyond them): along the track when both stand on
    the same line, otherwise on the straight between them, moved onto the nearest track. -> (lat, lng, line id, how)"""
    for f in lines_geojson()["features"]:
        c = f["geometry"]["coordinates"]
        ka, da = _chainage(c, a.lat, a.lng)
        kb, db_ = _chainage(c, b.lat, b.lng)
        if da < .5 and db_ < .5 and abs(ka - kb) > .5:
            total = sum(_hav(p, q) for p, q in zip(c, c[1:]))
            km = ka + (kb - ka) * frac
            if 0 <= km <= total:
                lat, lng = _at(c, km)
                return lat, lng, f["properties"]["id"], "track"
            break  # the drawn line ends before that point
    lat, lng = a.lat + (b.lat - a.lat) * frac, a.lng + (b.lng - a.lng) * frac
    slat, slng, line_id, dkm = _snap_to_lines(lat, lng)
    # beyond both stations the nearest track is just the end of the line we left: keep the straight continuation
    return (slat, slng, line_id, "snapped") if dkm <= 5 and 0 <= frac <= 1 else (lat, lng, None, "straight")


def sync(db: Session, force: bool = False, write: bool = True) -> list[dict]:
    """Apply the registries to the database (the caller commits). force=True also overrides names edited on the map.
    write=False leaves data/map_edits.json alone (dry run). Returns one row per registry station:
    {mtu, name, esr, action: same|renamed|kept|created|skipped, was, note}."""
    edits = load_edits()
    saved = edits["stations"]            # seed ESR -> {name, esr, lat, lng} typed by an admin
    out, new_edits = [], {}

    def by(code):
        return db.query(m.Station).filter(m.Station.esr_code == code).first() if code else None

    for reg in REGISTRIES:
        mtu = db.query(m.Mtu).filter(m.Mtu.code == reg.MTU_CODE).first()
        if not mtu:
            continue
        codes = getattr(reg, "CODES", {})
        keys = {x[3] for x in reg.STATIONS}

        def find(key):
            # 1. the code an admin left on the map  2. the real code from CODES  3. the code from the source data
            mine = (saved.get(key) or {}).get("esr")
            s = by(mine) if mine != key else None
            if s:
                return s
            real = codes.get(key)
            # a real code that is another station's key belongs to us only once that station has moved off it
            if real and (real not in keys or by(codes.get(real))):
                s = by(real)
            return s or by(key)

        found = {x[3]: find(x[3]) for x in reg.STATIONS}  # resolved before anything changes: codes may be swapped below
        listed_ids = set()
        for name, _section, km, key in reg.STATIONS:
            esr = codes.get(key, key)
            row = {"mtu": mtu.short, "name": name, "esr": esr, "km": km, "was": None, "note": ""}
            s = found[key]
            if not s:
                if key in edits.get("deletedStations", []):
                    out.append({**row, "action": "skipped", "note": "deleted on the map by an admin"})
                    continue
                if name not in reg.NEW_PLACEMENT:
                    out.append({**row, "action": "skipped", "note": "not in the database and no placement given"})
                    continue
                a, b, frac = reg.NEW_PLACEMENT[name]
                sa, sb = found.get(a), found.get(b)
                if not sa or not sb:
                    out.append({**row, "action": "skipped", "note": "neighbour stations not found"})
                    continue
                lat, lng, line_id, how = _place(sa, sb, frac)
                e = saved.get(key) or {}  # moved / renamed / given another code on the map before a re-seed
                s = m.Station(name=e.get("name") or name, esr_code=e.get("esr") or esr, mtu_id=mtu.id,
                              lat=e.get("lat", lat), lng=e.get("lng", lng), line=line_id or "-",
                              point_type="Ajratilgan", station_role="Oraliq", station_class="Stansiya", category="To'rtinchi",
                              cargo_operations=True, is_active=True, is_hub=False, kind="station", op_codes=[],
                              inn="—", leader_name="—", leader_phone="—", leader_email="—", corp_leader_name="—",
                              staff_rates=0, mtu_listed=True)
                db.add(s)
                db.flush()
                listed_ids.add(s.id)
                out.append({**row, "action": "created", "id": s.id, "lat": round(s.lat, 6), "lng": round(s.lng, 6),
                            "note": f"placed {how}, provisional code" if esr in reg.PROVISIONAL else f"placed {how}"})
                continue
            listed_ids.add(s.id)
            notes = []
            if s.mtu_id != mtu.id:
                notes.append("moved to this MTU")
                s.mtu_id = mtu.id
            if s.kind != "station":
                notes.append(f"{s.kind} -> station")
                s.kind = "station"
            s.mtu_listed = True
            action = "same"
            if s.esr_code == key and esr != key:
                notes.append(f"code {key} -> {esr}")
                s.esr_code = esr
                new_edits[key] = {"name": s.name, "esr": esr, "lat": s.lat, "lng": s.lng}
            if s.name != name:
                if force or key not in saved:
                    row["was"], action = s.name, "renamed"
                    s.name = name
                    new_edits[key] = {"name": name, "esr": s.esr_code, "lat": s.lat, "lng": s.lng}
                else:
                    action = "kept"
                    notes.append(f"name typed on the map is kept: {s.name}")
            out.append({**row, "action": action, "id": s.id, "note": "; ".join(notes)})
        # points that left the list
        db.flush()
        for s in db.query(m.Station).filter(m.Station.mtu_id == mtu.id, m.Station.mtu_listed):
            if s.id not in listed_ids:
                s.mtu_listed = False
    if write and new_edits:
        # like a rename on the map, so that it survives a re-seed and later manual renames win over the registry
        _store_edits(lambda e: e["stations"].update(new_edits))
    return out


def main():
    from .db import SessionLocal, engine
    apply = "--apply" in sys.argv
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except AttributeError:
        pass
    if apply:
        stamp = time.strftime("%Y%m%d-%H%M%S")
        db_file = engine.url.database if engine.url.get_backend_name() == "sqlite" else None
        for path in (db_file, EDITS_FILE):
            if path and os.path.exists(path):
                shutil.copy2(path, f"{path}.before-mtu-{stamp}")
                print(f"backup: {path}.before-mtu-{stamp}")
    with engine.begin() as conn:  # the column is normally added by app.main on start
        if "mtu_listed" not in {c["name"] for c in inspect(conn).get_columns("stations")}:
            conn.execute(text("ALTER TABLE stations ADD COLUMN mtu_listed BOOLEAN DEFAULT FALSE"))
    db = SessionLocal()
    try:
        rows = sync(db, force=True, write=apply)
        for mtu in db.query(m.Mtu).all():
            n = db.query(m.Station).filter(m.Station.mtu_id == mtu.id).count()
            k = db.query(m.Station).filter(m.Station.mtu_id == mtu.id, m.Station.mtu_listed).count()
            if k:
                print(f"{mtu.short}: {k} stations on the scheme, {n - k} other points (halts, yards, sidings)")
        for r in rows:
            if r["action"] != "same" or r["note"]:
                was = f"{r['was']} -> " if r["was"] else ""
                print(f"  {r['action']:8} {r['esr']:7} {was}{r['name']}" + (f"   [{r['note']}]" if r["note"] else ""))
        print(f"{sum(1 for r in rows if r['action'] == 'same' and not r['note'])} stations already match")
        if apply:
            db.commit()
            print("applied")
        else:
            db.rollback()
            print("dry run: nothing changed (add --apply)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
