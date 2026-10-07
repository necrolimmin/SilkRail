"""Admin editing of station staff and park tracks, with Excel template download / upload."""
from datetime import date
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from .. import excel, records
from .. import models as m
from ..auth import ADMIN_ROLES, current_user, require_roles
from ..db import get_db

router = APIRouter(prefix="/api/stations", tags=["station records"], dependencies=[Depends(current_user)])
admin_only = [Depends(require_roles(*ADMIN_ROLES))]
EDU = {"higher", "second", "special", "secondary"}
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
MAX_XLSX = 10 * 1024 * 1024


def _st(db, sid) -> m.Station:
    s = db.get(m.Station, sid)
    if not s:
        raise HTTPException(404, "station")
    return s


# ---------- staff ----------
class WorkerIn(BaseModel):
    fullName: str
    position: str
    gender: str
    birthDate: date
    education: str
    contractType: str | None = None
    hiredDate: date
    phone: str | None = None

    @field_validator("fullName", "position")
    @classmethod
    def not_blank(cls, v):
        if not v.strip():
            raise ValueError("required")
        return v.strip()[:128]

    @field_validator("gender")
    @classmethod
    def g(cls, v):
        if v not in ("M", "F"):
            raise ValueError("gender")
        return v

    @field_validator("education")
    @classmethod
    def e(cls, v):
        if v not in EDU:
            raise ValueError("education")
        return v


def _apply_worker(w: m.Worker, b: WorkerIn):
    if b.hiredDate < b.birthDate:
        raise HTTPException(400, "hired_before_birth")
    w.full_name, w.position, w.gender, w.education = b.fullName, b.position, b.gender, b.education
    w.birth_date, w.hired_date = b.birthDate, b.hiredDate
    w.contract_type = (b.contractType or "Asosiy").strip()[:32]
    w.phone = (b.phone or "").strip()[:32]


@router.post("/{sid}/workers", dependencies=admin_only)
def add_worker(sid: int, body: WorkerIn, db: Session = Depends(get_db)):
    s = _st(db, sid)
    w = m.Worker(station_id=s.id)
    _apply_worker(w, body)
    db.add(w)
    db.commit()
    records.save_station(db, s)
    return {"id": w.id}


@router.put("/{sid}/workers/{wid}", dependencies=admin_only)
def update_worker(sid: int, wid: int, body: WorkerIn, db: Session = Depends(get_db)):
    s = _st(db, sid)
    w = db.get(m.Worker, wid)
    if not w or w.station_id != s.id:
        raise HTTPException(404, "worker")
    _apply_worker(w, body)
    db.commit()
    records.save_station(db, s)
    return {"id": w.id}


@router.delete("/{sid}/workers/{wid}", dependencies=admin_only)
def delete_worker(sid: int, wid: int, db: Session = Depends(get_db)):
    s = _st(db, sid)
    w = db.get(m.Worker, wid)
    if w and w.station_id == s.id:
        db.query(m.KpiRecord).filter(m.KpiRecord.worker_id == w.id).delete(synchronize_session=False)
        db.delete(w)
        db.commit()
        records.save_station(db, s)
    return {"ok": True}


class RatesIn(BaseModel):
    rates: int


@router.put("/{sid}/staff-rates", dependencies=admin_only)
def set_rates(sid: int, body: RatesIn, db: Session = Depends(get_db)):
    s = _st(db, sid)
    if not 0 <= body.rates <= 100000:
        raise HTTPException(400, "rates")
    s.staff_rates = body.rates
    db.commit()
    records.save_station(db, s)
    return {"rates": s.staff_rates}


# ---------- Excel templates ----------
def _rows(db, s: m.Station, kind: str) -> list[dict]:
    if kind == "workers":
        ws = db.query(m.Worker).filter(m.Worker.station_id == s.id).order_by(m.Worker.full_name).all()
        return [{f: getattr(w, f) for f in records.WORKER_FIELDS} for w in ws]
    if kind == "roads":
        rs = db.query(m.AccessRoad).filter(m.AccessRoad.station_id == s.id).order_by(m.AccessRoad.id).all()
        out = [{f: getattr(r, f) for f in records.ROAD_FIELDS} for r in rs]
        for o in out:  # 0 means "not filled" for these optional numbers
            for k in ("created_year", "front", "wagons_at_once"):
                o[k] = o[k] or None
        return out
    ts = db.query(m.ParkTrack).filter(m.ParkTrack.station_id == s.id).order_by(m.ParkTrack.park, m.ParkTrack.id).all()
    return [{f: getattr(t, f) for f in records.TRACK_FIELDS} for t in ts]


def _check_kind(kind: str):
    if kind not in excel.SPECS:
        raise HTTPException(404, "kind")


@router.get("/{sid}/template/{kind}", dependencies=admin_only)
def download_template(sid: int, kind: str, lang: str = "uz", db: Session = Depends(get_db)):
    _check_kind(kind)
    s = _st(db, sid)
    data = excel.build_template(kind, _rows(db, s, kind), s.name, s.esr_code, lang)
    name = f"SilkRail_{s.name}_{kind}.xlsx"
    return Response(data, media_type=XLSX, headers={
        "Content-Disposition": f"attachment; filename=\"template.xlsx\"; filename*=UTF-8''{quote(name)}"})


@router.post("/{sid}/template/{kind}", dependencies=admin_only)
async def upload_template(sid: int, kind: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    _check_kind(kind)
    s = _st(db, sid)
    content = await file.read(MAX_XLSX + 1)
    if len(content) > MAX_XLSX:
        raise HTTPException(413, {"code": "too_large"})
    try:
        rows = excel.parse_template(kind, content, s.esr_code)
    except excel.TemplateError as e:
        raise HTTPException(422, {"code": e.code, **e.info})
    # the file replaces this section of the station
    if kind == "workers":
        ids = [w.id for w in db.query(m.Worker.id).filter(m.Worker.station_id == s.id)]
        if ids:
            db.query(m.KpiRecord).filter(m.KpiRecord.worker_id.in_(ids)).delete(synchronize_session=False)
        db.query(m.Worker).filter(m.Worker.station_id == s.id).delete(synchronize_session=False)
        for r in rows:
            db.add(m.Worker(station_id=s.id, full_name=r["full_name"], position=r["position"], gender=r["gender"],
                            birth_date=r["birth_date"], education=r["education"],
                            contract_type=(r.get("contract_type") or "Asosiy")[:32], hired_date=r["hired_date"],
                            phone=(r.get("phone") or "")[:32]))
    elif kind == "roads":
        db.query(m.AccessRoad).filter(m.AccessRoad.station_id == s.id).delete(synchronize_session=False)
        txt = lambda v, n: (v or "").strip()[:n]
        for r in rows:
            db.add(m.AccessRoad(
                station_id=s.id, owner=txt(r["owner"], 160), inn=txt(r.get("inn"), 16), leader=txt(r.get("leader"), 128),
                email=txt(r.get("email"), 128), phone=txt(r.get("phone"), 32), distance_km=r.get("distance_km") or 0,
                length_total=r["length_total"], length_t1=r.get("length_t1") or 0, length_t2=r.get("length_t2") or 0,
                contract_date=r["contract_date"], contract_start=r["contract_start"], contract_end=r["contract_end"],
                contract_type=txt(r.get("contract_type"), 32) or "—", has_tech_passport=bool(r.get("has_tech_passport")),
                has_instruction=bool(r.get("has_instruction")), junction=txt(r.get("junction"), 128),
                load_hours=r.get("load_hours") or 0, unload_hours=r.get("unload_hours") or 0, oper2_hours=r.get("oper2_hours") or 0,
                front=r.get("front") or 0, wagons_at_once=r.get("wagons_at_once") or 0, created_year=r.get("created_year") or 0,
                canceled=bool(r.get("canceled"))))
    else:
        db.query(m.ParkTrack).filter(m.ParkTrack.station_id == s.id).delete(synchronize_session=False)
        for r in rows:
            db.add(m.ParkTrack(station_id=s.id, park=r["park"][:64], track_no=r["track_no"][:16], purpose=r["purpose"][:128],
                               arrow_from=(r.get("arrow_from") or "")[:16], arrow_to=(r.get("arrow_to") or "")[:16],
                               length_total=r["length_total"], usable_length=r["usable_length"],
                               wagon_capacity=r.get("wagon_capacity") or 0, insulation=r.get("insulation") or "Yo'q",
                               contact_network=bool(r.get("contact_network")), alns=bool(r.get("alns"))))
    db.commit()
    records.save_station(db, s)
    return {"imported": len(rows)}


# ---------- park tracks: delete ----------
@router.delete("/{sid}/tracks/{tid}", dependencies=admin_only)
def delete_track(sid: int, tid: int, db: Session = Depends(get_db)):
    s = _st(db, sid)
    tr = db.get(m.ParkTrack, tid)
    if tr and tr.station_id == s.id:
        db.delete(tr)
        db.commit()
        records.save_station(db, s)
    return {"ok": True}


@router.delete("/{sid}/tracks", dependencies=admin_only)
def clear_park(sid: int, park: str, db: Session = Depends(get_db)):
    """Removes every track of one park of the station."""
    s = _st(db, sid)
    n = db.query(m.ParkTrack).filter(m.ParkTrack.station_id == s.id, m.ParkTrack.park == park).delete(synchronize_session=False)
    db.commit()
    records.save_station(db, s)
    return {"deleted": n}


# ---------- cadastre ----------
class BuildingIn(BaseModel):
    name: str
    cadastre_no: str | None = None
    floors: int | None = None
    footprint: float | None = None
    total: float | None = None
    usable: float | None = None


class CadastreIn(BaseModel):
    compiledAt: date
    passportNo: str | None = None
    parcelNo: str | None = None
    location: str | None = None
    objectName: str | None = None
    category: str | None = None
    subcategory: str | None = None
    useType: str | None = None
    servitude: str | None = None
    landArea: float
    m2Legal: float
    m2InUse: float
    buildings: list[BuildingIn] = []


@router.put("/{sid}/cadastre", dependencies=admin_only)
def save_cadastre(sid: int, body: CadastreIn, db: Session = Depends(get_db)):
    s = _st(db, sid)
    # land splits into: in use ⊂ legally registered ⊂ total
    if min(body.landArea, body.m2Legal, body.m2InUse) < 0:
        raise HTTPException(400, "negative")
    if body.m2Legal > body.landArea:
        raise HTTPException(400, "legal_gt_total")
    if body.m2InUse > body.m2Legal:
        raise HTTPException(400, "inuse_gt_legal")
    blds = []
    for b in body.buildings[:200]:
        if not b.name.strip():
            continue
        if any(v is not None and v < 0 for v in (b.floors, b.footprint, b.total, b.usable)):
            raise HTTPException(400, "negative")
        if b.total is not None and b.usable is not None and b.usable > b.total:
            raise HTTPException(400, "usable_gt_total")
        blds.append({"name": b.name.strip()[:128], "cadastre_no": (b.cadastre_no or "").strip()[:40], "floors": b.floors,
                     "footprint": b.footprint, "total": b.total, "usable": b.usable})
    txt = lambda v, n: (v or "").strip()[:n] or None
    c = db.query(m.Cadastre).filter(m.Cadastre.station_id == s.id).first() or m.Cadastre(station_id=s.id)
    c.compiled_at = body.compiledAt
    c.passport_no, c.parcel_no = txt(body.passportNo, 32) or "—", txt(body.parcelNo, 32) or "—"
    c.location, c.object_name = txt(body.location, 200) or "—", txt(body.objectName, 160) or "—"
    c.category, c.subcategory = txt(body.category, 64) or "—", txt(body.subcategory, 64)
    c.use_type, c.servitude = txt(body.useType, 64) or "—", txt(body.servitude, 200)
    c.land_area = c.m2_total = round(body.landArea, 2)
    c.m2_legal, c.m2_in_use = round(body.m2Legal, 2), round(body.m2InUse, 2)
    c.buildings = blds
    db.add(c)
    db.commit()
    records.save_station(db, s)
    from .station_routes import cadastre_out
    return cadastre_out(c)


# ---------- access roads: delete ----------
@router.delete("/{sid}/roads/{rid}", dependencies=admin_only)
def delete_road(sid: int, rid: int, db: Session = Depends(get_db)):
    s = _st(db, sid)
    r = db.get(m.AccessRoad, rid)
    if r and r.station_id == s.id:
        db.delete(r)
        db.commit()
        records.save_station(db, s)
    return {"ok": True}


@router.delete("/{sid}/roads", dependencies=admin_only)
def clear_roads(sid: int, db: Session = Depends(get_db)):
    s = _st(db, sid)
    n = db.query(m.AccessRoad).filter(m.AccessRoad.station_id == s.id).delete(synchronize_session=False)
    db.commit()
    records.save_station(db, s)
    return {"deleted": n}


@router.delete("/{sid}/workers", dependencies=admin_only)
def delete_all_workers(sid: int, db: Session = Depends(get_db)):
    """Removes the whole staff list of the station (and the KPI records that belong to it)."""
    s = _st(db, sid)
    ids = [w.id for w in db.query(m.Worker.id).filter(m.Worker.station_id == s.id)]
    if ids:
        db.query(m.KpiRecord).filter(m.KpiRecord.worker_id.in_(ids)).delete(synchronize_session=False)
    n = db.query(m.Worker).filter(m.Worker.station_id == s.id).delete(synchronize_session=False)
    db.commit()
    records.save_station(db, s)
    return {"deleted": n}


class IdsIn(BaseModel):
    ids: list[int]


@router.post("/{sid}/workers/delete", dependencies=admin_only)
def delete_workers(sid: int, body: IdsIn, db: Session = Depends(get_db)):
    """Deletes the selected employees of the station (and their KPI records)."""
    s = _st(db, sid)
    ids = [w.id for w in db.query(m.Worker.id).filter(m.Worker.station_id == s.id, m.Worker.id.in_(body.ids[:5000]))]
    if ids:
        db.query(m.KpiRecord).filter(m.KpiRecord.worker_id.in_(ids)).delete(synchronize_session=False)
        db.query(m.Worker).filter(m.Worker.id.in_(ids)).delete(synchronize_session=False)
        db.commit()
        records.save_station(db, s)
    return {"deleted": len(ids)}
