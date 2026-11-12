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


# ---------------- Cameras ----------------
@router.get("/cameras", dependencies=[Depends(require_page("cameras"))])
def cameras(group: int | None = None, station: int | None = None, q: str | None = None, lang: str | None = None,
            db: Session = Depends(get_db)):
    base = db.query(m.Camera, m.Station.name).join(m.Station, m.Station.id == m.Camera.station_id)
    if group:
        base = base.filter(m.Camera.group_id == group)
    if station:
        base = base.filter(m.Camera.station_id == station)
    if q:
        base = base.filter(m.Camera.name.ilike(f"%{q}%"))
    rows = base.all()
    own = [{"id": c.id, "name": c.name, "station": n, "stationId": c.station_id, "groupId": c.group_id,
            "online": c.online, "vendor": c.vendor, "streamUrl": c.stream_url, "lat": c.lat, "lng": c.lng} for c, n in rows]
    return _argus_cameras(db, group, station, q, lang) + own


def _argus_cameras(db: Session, group: int | None = None, station: int | None = None, q: str | None = None,
                   lang: str | None = None) -> list[dict]:
    """Cameras attached from Argus; they belong to no group, so a group filter leaves them out."""
    if group:
        return []
    from .. import argus
    aq = db.query(m.ArgusCamera)
    if station:
        aq = aq.filter(m.ArgusCamera.station_id == station)
    names = dict(db.query(m.Station.id, m.Station.name).all())
    out = [{**c, "station": names.get(c["stationId"], ""), "groupId": None, "lat": None, "lng": None}
           for c in argus.station_cameras(db, aq.order_by(m.ArgusCamera.id).all(), lang)]
    return [c for c in out if q.lower() in c["name"].lower()] if q else out


@router.get("/cameras/groups", dependencies=[Depends(require_page("cameras"))])
def camera_groups(db: Session = Depends(get_db)):
    return [{"id": g.id, "name": g.name, "count": db.query(func.count(m.Camera.id)).filter(m.Camera.group_id == g.id).scalar()}
            for g in db.query(m.CameraGroup).all()]


@router.get("/cameras/status", dependencies=[Depends(require_page("cameras"))])
def camera_status(db: Session = Depends(get_db)):
    total = db.query(func.count(m.Camera.id)).scalar()
    online = db.query(func.count(m.Camera.id)).filter(m.Camera.online).scalar()
    from_argus = _argus_cameras(db)
    total += len(from_argus)
    online += sum(c["online"] for c in from_argus)
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
