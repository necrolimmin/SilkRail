import json
import math
import os
import shutil
import time
from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import ADMIN_ROLES, current_user, require_roles, user_pages
from ..db import get_db
from .. import models as m



def _map_page(request: Request, u: m.User = Depends(current_user)):
    # MTU list is shared with the dashboard / analytics filters
    if request.url.path.rstrip("/") != "/api/map/mtus" and "map" not in user_pages(u):
        raise HTTPException(403, "page_forbidden")


router = APIRouter(prefix="/api/map", tags=["map"], dependencies=[Depends(_map_page)])
admin_only = [Depends(require_roles(*ADMIN_ROLES))]
DATA_DIR = os.getenv("DATA_DIR", "data")


@lru_cache
def lines_geojson() -> dict:
    with open(os.path.join(DATA_DIR, "lines.geojson"), encoding="utf-8") as f:
        return json.load(f)


def _hav(a, b):
    R = 6371.0
    la1, lo1, la2, lo2 = map(math.radians, (a[1], a[0], b[1], b[0]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


@router.get("/mtus")
def mtus(db: Session = Depends(get_db)):
    out = []
    for x in db.query(m.Mtu).all():
        # an MTU with an official station list (app.sync_mtu) counts only those; halts and yards around them do not
        listed = db.query(func.count(m.Station.id)).filter(m.Station.mtu_id == x.id, m.Station.mtu_listed).scalar()
        counted = [m.Station.mtu_id == x.id] + ([m.Station.mtu_listed] if listed else [])
        total = db.query(func.count(m.Station.id)).filter(*counted).scalar()
        active = db.query(func.count(m.Station.id)).filter(*counted, m.Station.is_active).scalar()
        corps = db.query(func.count(m.Company.id)).join(m.Station, m.Station.id == m.Company.station_id)\
            .filter(m.Station.mtu_id == x.id).scalar()
        bbox = db.query(func.min(m.Station.lat), func.min(m.Station.lng), func.max(m.Station.lat), func.max(m.Station.lng))\
            .filter(m.Station.mtu_id == x.id).one()
        out.append({"id": x.id, "code": x.code, "name": x.name, "short": x.short, "color": x.color, "lat": x.lat, "lng": x.lng,
                    "totalStations": total, "activeStations": active, "hasRegistry": bool(listed), "corporations": corps,
                    "railwayLength": x.railway_length_km, "utilization": x.utilization, "bbox": list(bbox)})
    return out


@router.get("/stations")
def stations(mtu: int | None = None, db: Session = Depends(get_db)):
    q = db.query(m.Station)
    if mtu:
        q = q.filter(m.Station.mtu_id == mtu)
    return [{"id": s.id, "name": s.name, "code": s.esr_code, "lat": s.lat, "lng": s.lng, "mtuId": s.mtu_id,
             "isHub": s.is_hub, "isActive": s.is_active, "line": s.line, "kind": s.kind, "listed": bool(s.mtu_listed)}
            for s in q.all()]


@router.get("/companies")
def companies(kind: str | None = None, db: Session = Depends(get_db)):
    q = db.query(m.Company)
    if kind:
        q = q.filter(m.Company.kind == kind)
    return [{"id": c.id, "name": c.name, "kind": c.kind, "fuelMode": c.fuel_mode, "stationId": c.station_id,
             "lat": c.lat, "lng": c.lng, "leader": c.leader, "phone": c.phone, "inn": c.inn} for c in q.all()]


@router.get("/cameras")
def cameras(db: Session = Depends(get_db)):
    return [{"id": c.id, "name": c.name, "lat": c.lat, "lng": c.lng, "online": c.online, "stationId": c.station_id,
             "streamUrl": c.stream_url} for c in db.query(m.Camera).all()]


@router.get("/crossings")
def crossings(db: Session = Depends(get_db)):
    return [{"id": c.id, "name": c.name, "lat": c.lat, "lng": c.lng, "km": c.km, "isProtected": c.is_protected}
            for c in db.query(m.Crossing).all()]


@router.get("/warnings")
def warnings(db: Session = Depends(get_db)):
    return [{"id": w.id, "title": w.title, "level": w.level, "lat": w.lat, "lng": w.lng, "createdAt": w.created_at.isoformat()}
            for w in db.query(m.MapWarning).all()]


@lru_cache
def lines_mtu_geojson() -> dict:
    path = os.path.join(DATA_DIR, "lines_mtu.geojson")
    if not os.path.exists(path):
        return lines_geojson()
    with open(path, encoding="utf-8") as f:
        return json.load(f)


@router.get("/lines")
def lines(divideByMtu: bool = False):
    return lines_mtu_geojson() if divideByMtu else lines_geojson()


@router.get("/line-list")
def line_list(minKm: float = 15):
    """Lines long enough to be picked in the UI (e.g. for track works)."""
    out = [{"id": f["properties"]["id"], "title": f["properties"]["title"], "lengthKm": f["properties"].get("lengthKm")}
           for f in lines_geojson()["features"] if (f["properties"].get("lengthKm") or 999) >= minKm]
    return sorted(out, key=lambda x: x["title"])


def _walk(coords, step_km):
    """Yield (lng, lat, km) points every step_km along polyline."""
    acc, next_mark = 0.0, 0.0
    for a, b in zip(coords, coords[1:]):
        d = _hav(a, b)
        while next_mark <= acc + d and d > 0:
            t = (next_mark - acc) / d
            yield a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, next_mark
            next_mark += step_km
        acc += d


@router.get("/km-marks")
def km_marks(line: str | None = None, pickets: bool = False, bbox: str | None = None):
    """Kilometre marks (every 10 km overview, 1 km per line) or pickets (100 m). bbox=minLng,minLat,maxLng,maxLat"""
    out = []
    bb = [float(x) for x in bbox.split(",")] if bbox else None
    for f in lines_geojson()["features"]:
        lid = f["properties"]["id"]
        if line and lid != line:
            continue
        if not line and (f["properties"].get("lengthKm") or 999) < 5:
            continue
        step = 0.1 if pickets else (1 if (line or bbox) else 10)
        for lng, lat, km in _walk(f["geometry"]["coordinates"], step):
            if bb and not (bb[0] <= lng <= bb[2] and bb[1] <= lat <= bb[3]):
                continue
            out.append({"line": lid, "km": round(km, 1), "lat": lat, "lng": lng})
            if len(out) > 6000:
                break
    return out


@router.get("/trains")
def live_trains():
    """Simulated live train positions moving along the lines."""
    t = time.time()
    out = []
    for i, f in enumerate(lines_geojson()["features"]):
        coords = f["geometry"]["coordinates"]
        total = sum(_hav(a, b) for a, b in zip(coords, coords[1:]))
        if total < 40:
            continue
        for j in range(max(1, min(4, int(total // 150)))):
            speed = 60 + 15 * j  # km/h
            pos = ((t / 3600 * speed) + j * total / 3 + i * 37) % (2 * total)
            forward = pos <= total
            dist = pos if forward else 2 * total - pos
            acc = 0
            for a, b in zip(coords, coords[1:]):
                d = _hav(a, b)
                if acc + d >= dist:
                    k = (dist - acc) / d if d else 0
                    out.append({"id": f"{f['properties']['id']}-{j}", "number": f"{1000 + i * 10 + j}",
                                "line": f["properties"]["title"], "lat": a[1] + (b[1] - a[1]) * k,
                                "lng": a[0] + (b[0] - a[0]) * k, "speed": speed, "heading": "→" if forward else "←",
                                "wagons": 30 + (i * 7 + j * 11) % 40})
                    break
                acc += d
    return out


@router.get("/search")
def search(q: str, db: Session = Depends(get_db)):
    like = f"%{q}%"
    sts = db.query(m.Station).filter((m.Station.name.ilike(like)) | (m.Station.esr_code.ilike(like))).limit(10).all()
    cs = db.query(m.Company).filter(m.Company.name.ilike(like)).limit(5).all()
    return [{"type": "station", "id": s.id, "name": s.name, "code": s.esr_code, "lat": s.lat, "lng": s.lng} for s in sts] + \
           [{"type": "company", "id": c.id, "name": c.name, "lat": c.lat, "lng": c.lng} for c in cs]


# -------- track works --------
REPAIR_TYPES = ["Kapital ta'mir", "O'rta ta'mir", "Joriy ta'mir", "Rels almashtirish", "Shpal almashtirish", "Ballast tozalash"]


@router.get("/repair-types")
def repair_types():
    return REPAIR_TYPES


class WorkIn(BaseModel):
    line: str
    kmStart: int
    kmEnd: int
    picketStart: int = 1
    picketEnd: int = 10
    repairType: str


@router.get("/works")
def works(db: Session = Depends(get_db)):
    out = []
    feats = {f["properties"]["id"]: f for f in lines_geojson()["features"]}
    for w in db.query(m.TrackWork).order_by(m.TrackWork.created_at.desc()).all():
        geom = []
        f = feats.get(w.line)
        if f:
            pts = [(lng, lat) for lng, lat, km in _walk(f["geometry"]["coordinates"], 1) if w.km_start <= km <= w.km_end]
            geom = [[p[1], p[0]] for p in pts]
        out.append({"id": w.id, "line": w.line, "kmStart": w.km_start, "kmEnd": w.km_end, "picketStart": w.picket_start,
                    "picketEnd": w.picket_end, "repairType": w.repair_type, "createdAt": w.created_at.isoformat(), "path": geom})
    return out


@router.post("/works")
def add_work(body: WorkIn, u=Depends(current_user), db: Session = Depends(get_db)):
    if body.kmEnd < body.kmStart:
        raise HTTPException(400, "km range")
    w = m.TrackWork(line=body.line, km_start=body.kmStart, km_end=body.kmEnd, picket_start=body.picketStart,
                    picket_end=body.picketEnd, repair_type=body.repairType, created_by=u.id)
    db.add(w)
    db.commit()
    return {"id": w.id}


@router.delete("/works/{wid}")
def del_work(wid: int, db: Session = Depends(get_db)):
    w = db.get(m.TrackWork, wid)
    if w:
        db.delete(w)
        db.commit()
    return {"ok": True}


# -------- manual stations (fill gaps in OSM data) --------
CUSTOM_FILE = os.path.join(DATA_DIR, "custom_stations.json")


def _snap_to_lines(lat: float, lng: float):
    """Nearest point on any railway line: (lat, lng, line_id, distance_km)."""
    best = (lat, lng, None, 1e9)
    k = math.cos(math.radians(lat))
    for f in lines_geojson()["features"]:
        c = f["geometry"]["coordinates"]
        for a, b in zip(c, c[1:]):
            if abs(a[1] - lat) > .3 and abs(b[1] - lat) > .3:
                continue
            ax, ay, bx, by, px, py = a[0] * k, a[1], b[0] * k, b[1], lng * k, lat
            dx, dy = bx - ax, by - ay
            L2 = dx * dx + dy * dy
            t = 0 if L2 == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L2))
            q = (a[1] + (b[1] - a[1]) * t, a[0] + (b[0] - a[0]) * t)
            d = _hav((lng, lat), (q[1], q[0]))
            if d < best[3]:
                best = (q[0], q[1], f["properties"]["id"], d)
    return best


def _save_custom(entry: dict | None = None, remove_name: str | None = None):
    items = []
    if os.path.exists(CUSTOM_FILE):
        with open(CUSTOM_FILE, encoding="utf-8") as f:
            items = json.load(f)
    if remove_name:
        items = [x for x in items if x["name"] != remove_name]
    if entry:
        items = [x for x in items if x["name"] != entry["name"]] + [entry]
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(CUSTOM_FILE, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=1)


class StationIn(BaseModel):
    name: str
    esr: str | None = None
    kind: str = "station"
    lat: float
    lng: float
    snap: bool = True


@router.post("/stations", dependencies=[Depends(require_roles("superadmin", "admin"))])
def add_station(body: StationIn, db: Session = Depends(get_db)):
    lat, lng, line_id, dkm = _snap_to_lines(body.lat, body.lng) if body.snap else (body.lat, body.lng, None, 0)
    if body.snap and dkm > 3:
        raise HTTPException(400, "too_far_from_track")
    from ..network import mtu_for
    code = mtu_for(lat, lng)
    mtu = db.query(m.Mtu).filter(m.Mtu.code == code).first()
    esr = (body.esr or "").strip() or str(790000 + db.query(func.count(m.Station.id)).scalar())
    s = m.Station(name=body.name.strip(), esr_code=esr, mtu_id=mtu.id, lat=lat, lng=lng, line=line_id or "-",
                  point_type="To'xtash punkti" if body.kind == "halt" else "Ajratilgan",
                  station_role="Yo'lovchi" if body.kind == "halt" else "Oraliq",
                  station_class="Bekat" if body.kind == "halt" else "Stansiya", category="To'rtinchi",
                  cargo_operations=body.kind != "halt", is_active=True, is_hub=False, kind=body.kind, op_codes=[],
                  inn="—", leader_name="—", leader_phone="—", leader_email="—", corp_leader_name="—", staff_rates=0)
    db.add(s)
    db.commit()
    _save_custom({"name": s.name, "esr": esr, "kind": body.kind, "lat": lat, "lng": lng})
    return {"id": s.id, "lat": lat, "lng": lng, "line": line_id, "snappedKm": round(dkm, 3)}


@router.delete("/stations/{sid}", dependencies=[Depends(require_roles("superadmin", "admin"))])
def delete_station(sid: int, db: Session = Depends(get_db)):
    s = db.get(m.Station, sid)
    if not s:
        raise HTTPException(404, "station")
    _save_custom(remove_name=s.name)
    esr = s.esr_code
    for model in (m.Worker, m.KpiRecord, m.IndicatorValue, m.TrafficDaily, m.TrainPass, m.EmmRoute, m.KmoItem, m.FinanceDaily,
                  m.YearMetric, m.FuelOperation, m.AccessRoad, m.Computer, m.Camera, m.Crossing, m.ParkTrack, m.Cadastre,
                  m.WagonWeighing, m.Scale, m.Company, m.StationMedia):
        db.query(model).filter(model.station_id == sid).delete(synchronize_session=False)
    db.delete(s)
    db.commit()
    # uploaded files (photos, 360°, tours, PDFs) live in one folder per station — remove it with the station
    shutil.rmtree(os.path.join("static", "uploads", "stations", str(sid)), ignore_errors=True)
    from .. import records
    records.remove_station(esr)

    def forget(e):
        for key in ("media", "stationInfo"):
            e.get(key, {}).pop(esr, None)
    _store_edits(forget)
    return {"ok": True}


# -------- admin editing: rename / move any map object, custom markers --------
EDITS_FILE = os.path.join(DATA_DIR, "map_edits.json")


def load_edits() -> dict:
    if os.path.exists(EDITS_FILE):
        with open(EDITS_FILE, encoding="utf-8") as f:
            return {"stations": {}, "markers": [], "deletedStations": [], **json.load(f)}
    return {"stations": {}, "markers": [], "deletedStations": []}


def _store_edits(fn):
    """Mirror edits into data/map_edits.json so they survive `python -m app.seed`."""
    e = load_edits()
    fn(e)
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(EDITS_FILE, "w", encoding="utf-8") as f:
        json.dump(e, f, ensure_ascii=False, indent=1)


def _marker_out(x: m.MapMarker) -> dict:
    return {"id": x.id, "name": x.name, "kind": x.kind, "color": x.color, "note": x.note, "lat": x.lat, "lng": x.lng}


def _sync_markers(db: Session):
    items = [{k: v for k, v in _marker_out(x).items() if k != "id"} for x in db.query(m.MapMarker).order_by(m.MapMarker.id)]
    _store_edits(lambda e: e.update(markers=items))


# kind -> (model, name attribute)
EDITABLE = {"station": (m.Station, "name"), "company": (m.Company, "name"), "camera": (m.Camera, "name"),
            "crossing": (m.Crossing, "name"), "warning": (m.MapWarning, "title"), "marker": (m.MapMarker, "name")}
MARKER_KINDS = {"station", "hub", "halt", "yard", "fuel", "company", "depot", "other", "camera", "crossingOk", "crossingNo",
                "warning", "point", "flag", "building", "alert", "info"}


class ObjectPatch(BaseModel):
    name: str | None = None
    lat: float | None = None
    lng: float | None = None
    esr: str | None = None
    kind: str | None = None
    color: str | None = None
    note: str | None = None


@router.patch("/objects/{kind}/{oid}", dependencies=admin_only)
def patch_object(kind: str, oid: int, body: ObjectPatch, db: Session = Depends(get_db)):
    if kind not in EDITABLE:
        raise HTTPException(400, "kind")
    model, name_attr = EDITABLE[kind]
    obj = db.get(model, oid)
    if not obj:
        raise HTTPException(404, kind)
    orig_esr = obj.esr_code if kind == "station" else None
    if body.name is not None:
        if not body.name.strip():
            raise HTTPException(400, "name")
        setattr(obj, name_attr, body.name.strip()[:160])
    if (body.lat is None) != (body.lng is None):
        raise HTTPException(400, "coords")
    if body.lat is not None:
        if not (-90 <= body.lat <= 90 and -180 <= body.lng <= 180):
            raise HTTPException(400, "coords")
        obj.lat, obj.lng = body.lat, body.lng
    if kind == "station" and body.esr is not None and body.esr.strip():
        obj.esr_code = body.esr.strip()[:16]
    if kind == "marker":
        if body.kind in MARKER_KINDS:
            obj.kind = body.kind
        if body.color:
            obj.color = body.color[:16]
        if body.note is not None:
            obj.note = body.note.strip() or None
    db.commit()
    if kind == "station":
        def upd(e):
            # key = ESR code the station gets from the seed, even if the code was edited later
            key = next((k for k, v in e["stations"].items() if v.get("esr") == orig_esr), orig_esr)
            e["stations"][key] = {"name": obj.name, "esr": obj.esr_code, "lat": obj.lat, "lng": obj.lng}
        _store_edits(upd)
    elif kind == "marker":
        _sync_markers(db)
    return {"ok": True, "id": obj.id, "name": getattr(obj, name_attr), "lat": obj.lat, "lng": obj.lng}


@router.delete("/objects/{kind}/{oid}", dependencies=admin_only)
def delete_object(kind: str, oid: int, db: Session = Depends(get_db)):
    if kind not in EDITABLE:
        raise HTTPException(400, "kind")
    if kind == "station":
        s = db.get(m.Station, oid)
        if s:
            esr = s.esr_code
            delete_station(oid, db)

            def upd(e):
                # keep a removed OSM station from coming back on re-seed
                key = next((k for k, v in e["stations"].items() if v.get("esr") == esr), esr)
                e["stations"].pop(key, None)
                e.setdefault("deletedStations", [])
                if key not in e["deletedStations"]:
                    e["deletedStations"].append(key)
            _store_edits(upd)
        return {"ok": True}
    model, _ = EDITABLE[kind]
    obj = db.get(model, oid)
    if obj:
        if kind == "company":
            db.query(m.FuelOperation).filter(m.FuelOperation.company_id == oid).delete(synchronize_session=False)
        db.delete(obj)
        db.commit()
        if kind == "marker":
            _sync_markers(db)
    return {"ok": True}


@router.get("/markers")
def markers(db: Session = Depends(get_db)):
    return [_marker_out(x) for x in db.query(m.MapMarker).order_by(m.MapMarker.id)]


class MarkerIn(BaseModel):
    name: str
    kind: str = "point"
    color: str = "#2563eb"
    note: str | None = None
    lat: float
    lng: float


@router.post("/markers", dependencies=admin_only)
def add_marker(body: MarkerIn, u: m.User = Depends(current_user), db: Session = Depends(get_db)):
    if not body.name.strip():
        raise HTTPException(400, "name")
    x = m.MapMarker(name=body.name.strip()[:160], kind=body.kind if body.kind in MARKER_KINDS else "point",
                    color=body.color[:16], note=(body.note or "").strip() or None, lat=body.lat, lng=body.lng, created_by=u.id)
    db.add(x)
    db.commit()
    _sync_markers(db)
    return _marker_out(x)


@router.delete("/markers/{mid}", dependencies=admin_only)
def delete_marker(mid: int, db: Session = Depends(get_db)):
    x = db.get(m.MapMarker, mid)
    if x:
        db.delete(x)
        db.commit()
        _sync_markers(db)
    return {"ok": True}
