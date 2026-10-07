import re
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, case
from sqlalchemy.orm import Session

from ..auth import current_user, require_page
from ..db import get_db
from .. import models as m
from .common import bucket_expr

router = APIRouter(prefix="/api", tags=["analytics"], dependencies=[Depends(current_user)])


def _ww_filter(q, start, end, station, scale, customs, only_extra):
    today = date.today()
    s = date.fromisoformat(start) if start else today - timedelta(days=30)
    e = date.fromisoformat(end) if end else today
    q = q.filter(m.WagonWeighing.weighed_at >= datetime.combine(s, datetime.min.time()),
                 m.WagonWeighing.weighed_at < datetime.combine(e + timedelta(days=1), datetime.min.time()))
    if station:
        q = q.filter(m.WagonWeighing.station_id == station)
    if scale:
        q = q.filter(m.WagonWeighing.scale_id == scale)
    if customs in ("import", "export"):
        q = q.filter(m.WagonWeighing.customs == customs)
    if only_extra:
        q = q.filter(m.WagonWeighing.extra_ton > 0)
    return q, s, e


@router.get("/scales", dependencies=[Depends(require_page("analytics"))])
def scales(db: Session = Depends(get_db)):
    rows = db.query(m.Scale, m.Station.name).join(m.Station, m.Station.id == m.Scale.station_id).all()
    return [{"id": s.id, "code": s.code, "kind": s.kind, "stationId": s.station_id, "station": n} for s, n in rows]


@router.get("/analytics/scale/summary", dependencies=[Depends(require_page("analytics"))])
def scale_summary(start: str | None = None, end: str | None = None, station: int | None = None, scale: int | None = None,
                  customs: str | None = None, mode: str = "days", db: Session = Depends(get_db)):
    q, s, e = _ww_filter(db.query(m.WagonWeighing), start, end, station, scale, customs, False)
    W = m.WagonWeighing
    tot = q.with_entities(func.count(W.id), func.sum(W.cargo_ton), func.sum(case((W.extra_ton > 0, 1), else_=0)),
                          func.sum(W.extra_ton), func.sum(case((W.confirmed, 1), else_=0))).one()
    b = bucket_expr(mode, W.weighed_at)
    series = q.with_entities(b, func.count(W.id), func.sum(case((W.extra_ton > 0, 1), else_=0)), func.sum(W.cargo_ton))\
        .group_by(b).order_by(b).all()
    by_station = q.join(m.Station, m.Station.id == W.station_id).with_entities(
        m.Station.name, func.count(W.id), func.sum(case((W.extra_ton > 0, 1), else_=0))).group_by(m.Station.name)\
        .order_by(func.count(W.id).desc()).limit(12).all()
    n = tot[0] or 0
    return {"start": s.isoformat(), "end": e.isoformat(),
            "totals": {"vagons": n, "weight": round(tot[1] or 0, 1), "extraVagons": int(tot[2] or 0),
                       "extraWeight": round(tot[3] or 0, 1), "confirmed": int(tot[4] or 0),
                       "confirmedPct": round((tot[4] or 0) / n * 100, 1) if n else 0,
                       "extraPct": round((tot[2] or 0) / n * 100, 1) if n else 0},
            "series": [{"period": r[0], "vagons": r[1], "extra": int(r[2] or 0), "weight": round(r[3] or 0, 1)} for r in series],
            "stations": [{"station": r[0], "vagons": r[1], "extra": int(r[2] or 0)} for r in by_station]}


@router.get("/analytics/scale/interval", dependencies=[Depends(require_page("analytics"))])
def scale_interval(date_: str | None = Query(None, alias="date"), station: int | None = None, db: Session = Depends(get_db)):
    """Hourly distribution for a single day."""
    d = date_ or date.today().isoformat()
    q, _, _ = _ww_filter(db.query(m.WagonWeighing), d, d, station, None, None, False)
    W = m.WagonWeighing
    rows = q.with_entities(W.weighed_at, W.extra_ton).all()
    hours = [{"hour": h, "vagons": 0, "extra": 0} for h in range(24)]
    for at, ex in rows:
        hours[at.hour]["vagons"] += 1
        hours[at.hour]["extra"] += ex > 0
    return hours


@router.get("/analytics/scale/weighings", dependencies=[Depends(require_page("analytics"))])
def weighings(start: str | None = None, end: str | None = None, station: int | None = None, scale: int | None = None,
              customs: str | None = None, onlyExtra: bool = False, q: str | None = None, page: int = 1, size: int = 10,
              db: Session = Depends(get_db)):
    base, _, _ = _ww_filter(db.query(m.WagonWeighing, m.Station.name).join(m.Station, m.Station.id == m.WagonWeighing.station_id),
                            start, end, station, scale, customs, onlyExtra)
    if q:
        base = base.filter(m.WagonWeighing.wagon_number.like(f"%{re.sub(r'[^0-9]', '', q)}%"))
    total = base.count()
    rows = base.order_by(m.WagonWeighing.weighed_at.desc()).offset((page - 1) * size).limit(size).all()
    return {"total": total, "items": [
        {"id": w.id, "wagonNumber": w.wagon_number, "station": n, "weighedAt": w.weighed_at.isoformat(), "normTon": w.norm_ton,
         "scaleTon": w.scale_ton, "cargoTon": w.cargo_ton, "extraTon": w.extra_ton, "customs": w.customs,
         "detected": w.detected, "confirmed": w.confirmed} for w, n in rows]}


# ---------------- Cameras ----------------
@router.get("/cameras", dependencies=[Depends(require_page("cameras"))])
def cameras(group: int | None = None, station: int | None = None, q: str | None = None, db: Session = Depends(get_db)):
    base = db.query(m.Camera, m.Station.name).join(m.Station, m.Station.id == m.Camera.station_id)
    if group:
        base = base.filter(m.Camera.group_id == group)
    if station:
        base = base.filter(m.Camera.station_id == station)
    if q:
        base = base.filter(m.Camera.name.ilike(f"%{q}%"))
    rows = base.all()
    return [{"id": c.id, "name": c.name, "station": n, "stationId": c.station_id, "groupId": c.group_id,
             "online": c.online, "vendor": c.vendor, "streamUrl": c.stream_url, "lat": c.lat, "lng": c.lng} for c, n in rows]


@router.get("/cameras/groups", dependencies=[Depends(require_page("cameras"))])
def camera_groups(db: Session = Depends(get_db)):
    return [{"id": g.id, "name": g.name, "count": db.query(func.count(m.Camera.id)).filter(m.Camera.group_id == g.id).scalar()}
            for g in db.query(m.CameraGroup).all()]


@router.get("/cameras/status", dependencies=[Depends(require_page("cameras"))])
def camera_status(db: Session = Depends(get_db)):
    total = db.query(func.count(m.Camera.id)).scalar()
    online = db.query(func.count(m.Camera.id)).filter(m.Camera.online).scalar()
    return {"total": total, "online": online, "offline": total - online}


# ---------------- Assistant (rule-based, answers from DB) ----------------
class Ask(BaseModel):
    question: str
    lang: str = "uz"


@router.post("/assistant/ask")
def ask(body: Ask, db: Session = Depends(get_db)):
    t = body.question.lower()
    L = body.lang
    tr = lambda uz, ru, en: {"uz": uz, "ru": ru, "en": en}.get(L, uz)
    # station lookup
    for s in db.query(m.Station).filter(m.Station.is_hub).all():
        if s.name.lower() in t:
            w = db.query(func.count(m.Worker.id)).filter(m.Worker.station_id == s.id).scalar()
            c = db.query(func.count(m.Camera.id)).filter(m.Camera.station_id == s.id).scalar()
            return {"answer": tr(f"{s.name} stansiyasi (ESR {s.esr_code}), {s.mtu.short} MTU. Xodimlar: {w}, kameralar: {c}.",
                                 f"Станция {s.name} (ЕСР {s.esr_code}), МТУ {s.mtu.short}. Сотрудников: {w}, камер: {c}.",
                                 f"{s.name} station (ESR {s.esr_code}), {s.mtu.short} RRN. Staff: {w}, cameras: {c}."),
                    "action": {"type": "openStation", "id": s.id}}
    if any(k in t for k in ["stansiya", "станц", "station"]):
        n = db.query(func.count(m.Station.id)).scalar()
        a = db.query(func.count(m.Station.id)).filter(m.Station.is_active).scalar()
        return {"answer": tr(f"Tizimda {n} ta stansiya bor, shundan {a} tasi faol.", f"В системе {n} станций, из них активных {a}.",
                             f"There are {n} stations, {a} active.")}
    if any(k in t for k in ["kamera", "камер", "camera"]):
        n = db.query(func.count(m.Camera.id)).scalar()
        on = db.query(func.count(m.Camera.id)).filter(m.Camera.online).scalar()
        return {"answer": tr(f"Kameralar: {n}, onlayn: {on}.", f"Камер: {n}, онлайн: {on}.", f"Cameras: {n}, online: {on}.")}
    if any(k in t for k in ["xodim", "сотрудн", "staff", "employee"]):
        n = db.query(func.count(m.Worker.id)).scalar()
        return {"answer": tr(f"Jami xodimlar: {n}.", f"Всего сотрудников: {n}.", f"Total staff: {n}.")}
    if any(k in t for k in ["mtu", "uzel", "узел"]):
        names = ", ".join(x.short for x in db.query(m.Mtu).all())
        return {"answer": tr(f"MTUlar: {names}.", f"МТУ: {names}.", f"Regional nodes: {names}.")}
    if any(k in t for k in ["tarozi", "вес", "scale", "vagon", "вагон", "wagon"]):
        d = date.today() - timedelta(days=1)
        q, _, _ = _ww_filter(db.query(m.WagonWeighing), d.isoformat(), d.isoformat(), None, None, None, False)
        n = q.count()
        ex = q.filter(m.WagonWeighing.extra_ton > 0).count()
        return {"answer": tr(f"Kecha {n} ta vagon tortildi, {ex} tasida ortiqcha yuk.",
                             f"Вчера взвешено {n} вагонов, с перегрузом — {ex}.",
                             f"Yesterday {n} wagons were weighed, {ex} overloaded.")}
    return {"answer": tr("Men stansiyalar, kameralar, xodimlar, MTU va tarozilar bo'yicha savollarga javob bera olaman. Masalan: \"Samarqand\" yoki \"nechta kamera bor?\"",
                         "Я отвечаю на вопросы о станциях, камерах, сотрудниках, МТУ и весах. Например: «Самарканд» или «сколько камер?»",
                         "I can answer about stations, cameras, staff, regional nodes and scales. E.g. \"Samarqand\" or \"how many cameras?\"")}
