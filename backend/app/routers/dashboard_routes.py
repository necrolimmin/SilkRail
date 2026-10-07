from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, case
from sqlalchemy.orm import Session

from ..auth import require_page
from ..db import get_db
from .. import models as m
from .common import bucket_expr, parse_range
from .station_routes import finance_aggregate, CAT_NAMES

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"], dependencies=[Depends(require_page("dashboard"))])


def _station_ids(db: Session, mtu: int | None):
    if not mtu:
        return None
    return [r[0] for r in db.query(m.Station.id).filter(m.Station.mtu_id == mtu)]


@router.get("/fuel")
def fuel(mode: str = "days", start: str | None = None, end: str | None = None, mtu: int | None = None,
         scope: str = "all", db: Session = Depends(get_db)):
    s, e = parse_range(start, end, mode)
    b = bucket_expr(mode, m.FuelOperation.day)
    q = db.query(m.FuelOperation).filter(m.FuelOperation.day >= s, m.FuelOperation.day <= e, m.FuelOperation.op == "loading")
    ids = _station_ids(db, mtu)
    if ids is not None:
        q = q.filter(m.FuelOperation.station_id.in_(ids))
    if scope in ("local", "export"):
        q = q.filter(m.FuelOperation.scope == scope)
    series = q.with_entities(b, func.sum(m.FuelOperation.plan_wagons), func.sum(m.FuelOperation.given_wagons),
                             func.sum(m.FuelOperation.wagons), func.sum(m.FuelOperation.tons)).group_by(b).order_by(b).all()
    by_station = q.join(m.Station, m.Station.id == m.FuelOperation.station_id).with_entities(
        m.Station.id, m.Station.name, func.sum(m.FuelOperation.plan_wagons), func.sum(m.FuelOperation.given_wagons),
        func.sum(m.FuelOperation.wagons), func.sum(m.FuelOperation.tons)).group_by(m.Station.id, m.Station.name)\
        .order_by(func.sum(m.FuelOperation.wagons).desc()).all()
    by_product = q.with_entities(m.FuelOperation.product, func.sum(m.FuelOperation.wagons), func.sum(m.FuelOperation.tons))\
        .group_by(m.FuelOperation.product).all()
    tot = [sum((r[i] or 0) for r in series) for i in range(1, 5)]
    return {
        "start": s.isoformat(), "end": e.isoformat(),
        "totals": {"plan": tot[0], "given": tot[1], "loaded": tot[2], "tons": round(tot[3], 1), "diff": tot[2] - tot[0]},
        "series": [{"period": r[0], "plan": r[1], "given": r[2], "loaded": r[3], "tons": round(r[4] or 0, 1)} for r in series],
        "stations": [{"id": r[0], "name": r[1], "plan": r[2], "given": r[3], "loaded": r[4], "tons": round(r[5] or 0, 1),
                      "diff": (r[4] or 0) - (r[2] or 0)} for r in by_station],
        "products": [{"product": r[0], "wagons": r[1], "tons": round(r[2] or 0, 1)} for r in by_product],
    }


@router.get("/fuel-cargo")
def fuel_cargo(mode: str = "days", start: str | None = None, end: str | None = None, mtu: int | None = None,
               scope: str = "all", db: Session = Depends(get_db)):
    s, e = parse_range(start, end, mode)
    b = bucket_expr(mode, m.FuelOperation.day)
    q = db.query(m.FuelOperation).filter(m.FuelOperation.day >= s, m.FuelOperation.day <= e)
    ids = _station_ids(db, mtu)
    if ids is not None:
        q = q.filter(m.FuelOperation.station_id.in_(ids))
    if scope in ("local", "export"):
        q = q.filter(m.FuelOperation.scope == scope)
    load_w = func.sum(case((m.FuelOperation.op == "loading", m.FuelOperation.wagons), else_=0))
    unload_w = func.sum(case((m.FuelOperation.op == "unloading", m.FuelOperation.wagons), else_=0))
    load_t = func.sum(case((m.FuelOperation.op == "loading", m.FuelOperation.tons), else_=0))
    unload_t = func.sum(case((m.FuelOperation.op == "unloading", m.FuelOperation.tons), else_=0))
    series = q.with_entities(b, load_w, unload_w, load_t, unload_t).group_by(b).order_by(b).all()
    prods = q.with_entities(m.FuelOperation.product, load_w, unload_w, load_t, unload_t).group_by(m.FuelOperation.product).all()
    comps = q.join(m.Company, m.Company.id == m.FuelOperation.company_id).with_entities(
        m.Company.id, m.Company.name, load_w, unload_w, load_t, unload_t).group_by(m.Company.id, m.Company.name)\
        .order_by(load_w.desc()).all()
    fmt = lambda r: {"loadWagons": int(r[0] or 0), "unloadWagons": int(r[1] or 0), "loadTons": round(r[2] or 0, 1), "unloadTons": round(r[3] or 0, 1)}
    return {"start": s.isoformat(), "end": e.isoformat(),
            "series": [{"period": r[0], **fmt(r[1:])} for r in series],
            "products": [{"product": r[0], **fmt(r[1:])} for r in prods],
            "companies": [{"id": r[0], "name": r[1], **fmt(r[2:])} for r in comps]}


@router.get("/indicators")
def indicators(category: int = 1, year: int | None = None, month: int | None = None, mtu: int | None = None,
               q: str | None = None, page: int = 1, size: int = 10, db: Session = Depends(get_db)):
    today = date.today()
    year = year or today.year
    month = month or (today.month if year == today.year else 12)
    iv = m.IndicatorValue
    prev = func.sum(case(((iv.year == year - 1), iv.fact), else_=0))
    plan = func.sum(case(((iv.year == year), iv.plan), else_=0))
    cur = func.sum(case(((iv.year == year), iv.fact), else_=0))
    base = db.query(m.Station.id, m.Station.name, prev, plan, cur).join(iv, iv.station_id == m.Station.id)\
        .filter(iv.category == category, iv.month <= month, iv.year.in_([year - 1, year]))
    if mtu:
        base = base.filter(m.Station.mtu_id == mtu)
    if q:
        base = base.filter(m.Station.name.ilike(f"%{q}%"))
    base = base.group_by(m.Station.id, m.Station.name).order_by(cur.desc())
    rows = base.all()
    total = len(rows)
    items = rows[(page - 1) * size: page * size]
    return {"category": category, "key": CAT_NAMES[category], "year": year, "month": month, "total": total, "items": [
        {"stationId": r[0], "station": r[1], "prevReport": round(r[2], 1), "plan": round(r[3], 1), "report": round(r[4], 1),
         "diffPlan": round(r[4] - r[3], 1), "diffPrev": round(r[4] - r[2], 1)} for r in items],
        "sum": {"prevReport": round(sum(r[2] for r in rows), 1), "plan": round(sum(r[3] for r in rows), 1),
                "report": round(sum(r[4] for r in rows), 1)}}


@router.get("/income-expense")
def income_expense(metric: str = "staff", year: int | None = None, mtu: int | None = None, q: str | None = None,
                   page: int = 1, size: int = 10, db: Session = Depends(get_db)):
    year = year or date.today().year
    base = db.query(m.YearMetric, m.Station.name).join(m.Station, m.Station.id == m.YearMetric.station_id)\
        .filter(m.YearMetric.year == year, m.YearMetric.metric == metric)
    if mtu:
        base = base.filter(m.Station.mtu_id == mtu)
    if q:
        base = base.filter(m.Station.name.ilike(f"%{q}%"))
    total = base.count()
    rows = base.order_by(m.YearMetric.fact.desc()).offset((page - 1) * size).limit(size).all()
    deliv = {r.station_id: r for r in db.query(m.YearMetric).filter(m.YearMetric.year == year, m.YearMetric.metric == "delivery")}
    return {"metric": metric, "year": year, "total": total, "items": [
        {"stationId": ym.station_id, "station": name, "lastYear": ym.last_year, "plan": ym.plan, "fact": ym.fact,
         "diff": ym.fact - ym.plan,
         "delivery": {"lastYear": deliv[ym.station_id].last_year, "plan": deliv[ym.station_id].plan,
                      "diff": deliv[ym.station_id].fact - deliv[ym.station_id].plan} if ym.station_id in deliv else None}
        for ym, name in rows]}


@router.get("/finance")
def finance(start: str | None = None, end: str | None = None, mtu: int | None = None, db: Session = Depends(get_db)):
    s, e = parse_range(start, end, "any")
    data = finance_aggregate(db, s, e, _station_ids(db, mtu))
    by_mtu = []
    for x in db.query(m.Mtu).all():
        ids = [r[0] for r in db.query(m.Station.id).filter(m.Station.mtu_id == x.id)]
        a = finance_aggregate(db, s, e, ids)
        by_mtu.append({"mtuId": x.id, "name": x.short, "color": x.color, "income": a["incomeTotal"],
                       "fines": a["finesTotal"], "loaded": a["loaded"]["total"], "unloaded": a["unloaded"]["total"]})
    return {"start": s.isoformat(), "end": e.isoformat(), **data, "byMtu": by_mtu}


@router.get("/overview")
def overview(db: Session = Depends(get_db)):
    """Top KPI cards for the dashboard header."""
    today = date.today()
    return {
        "stations": db.query(func.count(m.Station.id)).scalar(),
        "activeStations": db.query(func.count(m.Station.id)).filter(m.Station.is_active).scalar(),
        "companies": db.query(func.count(m.Company.id)).scalar(),
        "cameras": db.query(func.count(m.Camera.id)).scalar(),
        "workers": db.query(func.count(m.Worker.id)).scalar(),
        "railwayLength": round(db.query(func.sum(m.Mtu.railway_length_km)).scalar() or 0, 1),
        "todayTrains": int(db.query(func.sum(m.TrafficDaily.trains_in + m.TrafficDaily.trains_out)).filter(m.TrafficDaily.day == today).scalar() or 0),
    }
