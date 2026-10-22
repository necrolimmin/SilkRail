import json
import logging
import math
import os
import shutil
import tempfile
import time
import urllib.request
import uuid
import zipfile
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import ADMIN_ROLES, current_user, require_roles, require_station_tab, user_station_tabs
from ..db import get_db
from .. import models as m
from .common import bucket_expr, parse_range, page

router = APIRouter(prefix="/api/stations", tags=["stations"], dependencies=[Depends(current_user)])

CAT_NAMES = {1: "loadWagons", 2: "loadTons", 3: "unloadWagons", 4: "statWeight", 5: "unloadPerOp", 6: "workingPark", 7: "sentWagons"}


def _st(db, sid) -> m.Station:
    s = db.get(m.Station, sid)
    if not s:
        raise HTTPException(404, "station")
    return s


log = logging.getLogger("silkrail.stations")
admin_only = [Depends(require_roles(*ADMIN_ROLES))]


def _weather_estimate(s: m.Station):
    """Seasonal estimate, used only when the live weather service is unreachable."""
    d = date.today()
    base = 18 + 14 * math.sin((d.timetuple().tm_yday - 100) / 365 * 2 * math.pi) - (s.lat - 40) * 1.5
    return {"temp": round(base + (s.id % 5) - 2, 1), "humidity": 25 + (s.id * 7) % 40, "wind": 2 + (s.id % 9),
            "condition": ["clear", "cloudy", "partly", "clear", "wind"][s.id % 5], "isDay": True, "live": False}


# WMO weather codes -> condition keys used by the UI (weather.* translations)
def _wmo(code: int) -> str:
    if code == 0:
        return "clear"
    if code in (1, 2):
        return "partly"
    if code == 3:
        return "cloudy"
    if code in (45, 48):
        return "fog"
    if 71 <= code <= 77 or code in (85, 86):
        return "snow"
    if code >= 95:
        return "storm"
    if 51 <= code <= 82:
        return "rain"
    return "cloudy"


_WEATHER_CACHE: dict[tuple, tuple[float, dict]] = {}
WEATHER_TTL = 600  # seconds


def live_weather(lat: float, lng: float) -> dict | None:
    """Current weather from Open-Meteo (free, no API key), cached for 10 minutes per ~1 km cell."""
    key = (round(lat, 2), round(lng, 2))
    hit = _WEATHER_CACHE.get(key)
    if hit and hit[0] > time.time():
        return hit[1]
    url = ("https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f"
           "&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,"
           "weather_code,is_day&hourly=temperature_2m,weather_code,is_day&forecast_hours=8"
           "&wind_speed_unit=ms&timezone=auto") % (lat, lng)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "SilkRail/1.0"})
        with urllib.request.urlopen(req, timeout=5) as r:
            body = json.load(r)
            cur = body["current"]
    except Exception as e:  # network down, service error, bad payload
        log.warning("weather unavailable for %s: %s", key, e)
        return None
    out = {"temp": round(cur["temperature_2m"], 1), "humidity": round(cur["relative_humidity_2m"]),
           "wind": round(cur["wind_speed_10m"], 1), "condition": _wmo(int(cur["weather_code"])),
           "isDay": bool(cur.get("is_day", 1)), "observedAt": cur.get("time"), "live": True, "source": "Open-Meteo",
           "feels": round(cur["apparent_temperature"], 1) if cur.get("apparent_temperature") is not None else None,
           "windDir": cur.get("wind_direction_10m"), "precip": cur.get("precipitation")}
    # the next six whole hours after the observation (local station time)
    h = body.get("hourly") or {}
    now = (cur.get("time") or "")[:13]
    out["hours"] = [{"time": tm[11:16], "temp": round(tp), "condition": _wmo(int(wc)), "isDay": bool(d)}
                    for tm, tp, wc, d in zip(h.get("time", []), h.get("temperature_2m", []), h.get("weather_code", []), h.get("is_day", []))
                    if tm[:13] > now and tp is not None and wc is not None][:6]
    _WEATHER_CACHE[key] = (time.time() + WEATHER_TTL, out)
    return out


def _media(db, s: m.Station) -> dict:
    rows = db.query(m.StationMedia).filter(m.StationMedia.station_id == s.id).order_by(m.StationMedia.id).all()
    out = lambda x: {"id": x.id, "url": x.url, "title": x.title}
    photos = [out(x) for x in rows if x.kind == "photo"]
    # 360°: single equirectangular images ("image") and whole virtual tours from Pano2VR/krpano ("tour")
    panos = [{**out(x), "type": "tour" if x.kind == "tour" else "image"} for x in rows if x.kind in ("pano", "tour")]
    if s.image_url and not photos:
        photos = [{"id": None, "url": s.image_url, "title": None}]
    if s.panorama_url and not panos:  # built-in demo panorama until an admin uploads a real one
        panos = [{"id": None, "url": s.panorama_url, "title": "Demo", "type": "image"}]
    # PDF documents (one per kind): cadastre document and station scheme
    docs = {x.kind: {**out(x), "uploadedAt": x.created_at.isoformat() if x.created_at else None} for x in rows if x.kind in DOC_KINDS}
    return {"photos": photos, "panoramas": panos, "docs": docs}


@router.get("/{sid}/weather", dependencies=[Depends(require_station_tab("home"))])
def weather(sid: int, db: Session = Depends(get_db)):
    s = _st(db, sid)
    return live_weather(s.lat, s.lng) or _weather_estimate(s)


@router.get("/{sid}")
def detail(sid: int, u: m.User = Depends(current_user), db: Session = Depends(get_db)):
    s = _st(db, sid)
    tabs = user_station_tabs(u)
    media = _media(db, s)
    if "home" not in tabs:
        media["photos"] = []
    if "pano" not in tabs:
        media["panoramas"] = []
    if "cadastre" not in tabs:
        media["docs"] = {}
    return {**media, 
        "id": s.id, "name": s.name, "esrCode": s.esr_code, "mtu": {"id": s.mtu.id, "name": s.mtu.name, "short": s.mtu.short},
        "lat": s.lat, "lng": s.lng, "roadCode": s.road_code, "networkMark": s.network_mark, "pointType": s.point_type,
        "stationRole": s.station_role, "stationClass": s.station_class, "category": s.category,
        "cargoOperations": s.cargo_operations, "transitPoint": s.transit_point, "isOperator": s.is_operator,
        "isActive": s.is_active, "isHub": s.is_hub, "opCodes": s.op_codes, "inn": s.inn,
        "leader": {"fullName": s.leader_name, "phone": s.leader_phone, "email": s.leader_email},
        "corpLeader": s.corp_leader_name, "imageUrl": s.image_url, "panoramaUrl": s.panorama_url,
        "country": s.country or "O'zbekiston", "road": s.road_name or "O'zbekiston Temir Yo'llari (O'TY)",
    }


# ---------- admin: edit general info ----------
class LeaderIn(BaseModel):
    fullName: str | None = None
    phone: str | None = None
    email: str | None = None


class StationPatch(BaseModel):
    esrCode: str | None = None
    roadCode: str | None = None
    networkMark: str | None = None
    country: str | None = None
    road: str | None = None
    pointType: str | None = None
    stationRole: str | None = None
    stationClass: str | None = None
    category: str | None = None
    cargoOperations: bool | None = None
    transitPoint: bool | None = None
    isOperator: bool | None = None
    isActive: bool | None = None
    inn: str | None = None
    lat: float | None = None
    lng: float | None = None
    leader: LeaderIn | None = None
    corpLeader: str | None = None
    opCodes: list[str] | None = None


# API field -> (column, max length or None for non-strings)
_TEXT = {"esrCode": ("esr_code", 16), "roadCode": ("road_code", 8), "networkMark": ("network_mark", 16), "country": ("country", 64),
         "road": ("road_name", 128), "pointType": ("point_type", 32), "stationRole": ("station_role", 32),
         "stationClass": ("station_class", 32), "category": ("category", 32), "inn": ("inn", 16), "corpLeader": ("corp_leader_name", 128)}
_BOOL = {"cargoOperations": "cargo_operations", "transitPoint": "transit_point", "isOperator": "is_operator", "isActive": "is_active"}
INFO_COLUMNS = [c for c, _ in _TEXT.values()] + list(_BOOL.values()) + ["leader_name", "leader_phone", "leader_email", "op_codes"]


def _remember(fn):
    """Mirror admin edits into data/map_edits.json so `python -m app.seed` keeps them."""
    from .map_routes import _store_edits
    _store_edits(fn)


@router.patch("/{sid}", dependencies=admin_only)
def update_station(sid: int, body: StationPatch, u: m.User = Depends(current_user), db: Session = Depends(get_db)):
    s = _st(db, sid)
    orig_esr = s.esr_code
    data = body.model_dump(exclude_unset=True)
    for f, (col, n) in _TEXT.items():
        if f in data and data[f] is not None:
            setattr(s, col, str(data[f]).strip()[:n] or getattr(s, col))
    for f, col in _BOOL.items():
        if data.get(f) is not None:
            setattr(s, col, data[f])
    if body.leader:
        for f, col, n in (("fullName", "leader_name", 128), ("phone", "leader_phone", 32), ("email", "leader_email", 128)):
            v = getattr(body.leader, f)
            if v is not None:
                setattr(s, col, v.strip()[:n])
    if body.opCodes is not None:
        s.op_codes = [str(c).strip()[:8] for c in body.opCodes if str(c).strip()][:40]
    if body.lat is not None and body.lng is not None:
        if not (-90 <= body.lat <= 90 and -180 <= body.lng <= 180):
            raise HTTPException(400, "coords")
        s.lat, s.lng = body.lat, body.lng
    db.commit()

    def upd(e):
        info = e.setdefault("stationInfo", {})
        key = next((k for k, v in info.items() if v.get("esr_code") == orig_esr), orig_esr)
        info[key] = {c: getattr(s, c) for c in INFO_COLUMNS}
        st = e.setdefault("stations", {})
        skey = next((k for k, v in st.items() if v.get("esr") == orig_esr), orig_esr)
        st[skey] = {"name": s.name, "esr": s.esr_code, "lat": s.lat, "lng": s.lng}
    _remember(upd)
    return detail(sid, u, db)


# ---------- admin: photos and 360° panoramas ----------
UPLOAD_ROOT = os.path.join("static", "uploads", "stations")
MEDIA_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
MEDIA_LIMIT_MB = {"photo": 15, "pano": 80, "tour": 600, "cad_doc": 40, "scheme": 40}
DOC_KINDS = {"cad_doc", "scheme"}
ZIP_TYPES = {"application/zip", "application/x-zip-compressed", "application/octet-stream", "multipart/x-zip"}
# only static web assets are extracted from a tour archive; everything else is skipped
TOUR_EXTS = {".html", ".htm", ".js", ".mjs", ".css", ".json", ".xml", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".ico",
             ".mp3", ".ogg", ".wav", ".m4a", ".mp4", ".webm", ".woff", ".woff2", ".ttf", ".otf", ".txt"}
TOUR_MAX_FILES = 30000
TOUR_MAX_UNPACKED = 3 * 1024 ** 3


def _extract_tour(zip_path: str, dest: str) -> str:
    """Safely unpacks a tour archive into dest and returns the path (relative to dest) of its index.html."""
    try:
        z = zipfile.ZipFile(zip_path)
    except zipfile.BadZipFile:
        raise HTTPException(400, "bad_zip")
    with z:
        infos = [i for i in z.infolist() if not i.is_dir()]
        if len(infos) > TOUR_MAX_FILES or sum(i.file_size for i in infos) > TOUR_MAX_UNPACKED:
            raise HTTPException(413, "too_large")
        for i in infos:
            parts = [p for p in i.filename.replace("\\", "/").split("/") if p not in ("", ".")]
            if not parts or parts[0] == "__MACOSX" or any(p == ".." or ":" in p for p in parts):
                continue  # zip-slip guard + macOS metadata
            if os.path.splitext(parts[-1])[1].lower() not in TOUR_EXTS:
                continue
            target = os.path.join(dest, *parts)
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with z.open(i) as src, open(target, "wb") as out:
                shutil.copyfileobj(src, out)
    found = []
    for root, _, files in os.walk(dest):
        if "index.html" in files:
            found.append(os.path.relpath(os.path.join(root, "index.html"), dest))
    if not found:
        raise HTTPException(400, "no_index")
    return min(found, key=lambda p: p.count(os.sep)).replace(os.sep, "/")


def _media_dir(url: str) -> str | None:
    """Folder that belongs to one uploaded media item (a tour folder or the single file)."""
    parts = url.lstrip("/").split("/")  # static/uploads/stations/<sid>/<name>/...
    if parts[:3] != ["static", "uploads", "stations"] or len(parts) < 5 or ".." in parts:
        return None
    return os.path.join(*parts[:5])


def _sync_media(db, s: m.Station):
    rows = db.query(m.StationMedia).filter(m.StationMedia.station_id == s.id).order_by(m.StationMedia.id).all()
    items = [{"kind": x.kind, "url": x.url, "title": x.title} for x in rows]
    _remember(lambda e: e.setdefault("media", {}).__setitem__(s.esr_code, items))


@router.post("/{sid}/media", dependencies=admin_only)
async def upload_media(sid: int, kind: str = Form(...), title: str | None = Form(None), file: UploadFile = File(...),
                       u: m.User = Depends(current_user), db: Session = Depends(get_db)):
    s = _st(db, sid)
    if kind not in MEDIA_LIMIT_MB:
        raise HTTPException(400, "kind")
    limit = MEDIA_LIMIT_MB[kind] * 1024 * 1024
    folder = os.path.join(UPLOAD_ROOT, str(s.id))
    os.makedirs(folder, exist_ok=True)
    if kind == "tour":
        if not (file.filename or "").lower().endswith(".zip") and file.content_type not in ZIP_TYPES:
            raise HTTPException(415, "type")
        name = f"tour-{uuid.uuid4().hex[:12]}"
        dest = os.path.join(folder, name)
        tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
        try:
            size = 0
            while chunk := await file.read(1024 * 1024):  # stream to disk, tours are hundreds of MB
                size += len(chunk)
                if size > limit:
                    raise HTTPException(413, "too_large")
                tmp.write(chunk)
            tmp.close()
            index = _extract_tour(tmp.name, dest)
        except Exception:
            shutil.rmtree(dest, ignore_errors=True)
            raise
        finally:
            tmp.close()
            os.unlink(tmp.name)
        url = f"/static/uploads/stations/{s.id}/{name}/{index}"
        default_title = os.path.splitext(os.path.basename(file.filename or ""))[0]
    else:
        if kind in DOC_KINDS:
            is_pdf = file.content_type == "application/pdf" or (file.filename or "").lower().endswith(".pdf")
            ext = ".pdf" if is_pdf else None
        else:
            ext = MEDIA_TYPES.get(file.content_type or "")
        if not ext:
            raise HTTPException(415, "type")
        data = await file.read(limit + 1)
        if len(data) > limit:
            raise HTTPException(413, "too_large")
        if kind in DOC_KINDS:
            if not data.startswith(b"%PDF"):
                raise HTTPException(415, "type")
            # one document per kind: the new file replaces the previous one
            for old in db.query(m.StationMedia).filter(m.StationMedia.station_id == s.id, m.StationMedia.kind == kind).all():
                path = _media_dir(old.url)
                if path and os.path.isfile(path):
                    os.remove(path)
                db.delete(old)
        name = f"{kind}-{uuid.uuid4().hex[:12]}{ext}"
        with open(os.path.join(folder, name), "wb") as f:
            f.write(data)
        url = f"/static/uploads/stations/{s.id}/{name}"
        default_title = os.path.basename(file.filename or "")[:160] if kind in DOC_KINDS else None
    x = m.StationMedia(station_id=s.id, kind=kind, url=url,
                       title=(title or "").strip()[:160] or default_title, created_by=u.id)
    db.add(x)
    db.commit()
    _sync_media(db, s)
    return _media(db, s)


@router.delete("/{sid}/media/{mid}", dependencies=admin_only)
def delete_media(sid: int, mid: int, db: Session = Depends(get_db)):
    s = _st(db, sid)
    x = db.get(m.StationMedia, mid)
    if x and x.station_id == s.id:
        path = _media_dir(x.url)
        if path and os.path.isdir(path):
            shutil.rmtree(path, ignore_errors=True)
        elif path and os.path.isfile(path):
            os.remove(path)
        db.delete(x)
        db.commit()
        _sync_media(db, s)
    return _media(db, s)


@router.get("/{sid}/workers", dependencies=[Depends(require_station_tab("staff"))])
def workers(sid: int, q: str | None = None, page_: int = Query(1, alias="page"), size: int = 10, db: Session = Depends(get_db)):
    s = _st(db, sid)
    base = db.query(m.Worker).filter(m.Worker.station_id == sid)
    all_w = base.all()
    today = date.today()
    ages = [(today - w.birth_date).days // 365 for w in all_w]
    stats = {
        "total": len(all_w), "male": sum(w.gender == "M" for w in all_w), "female": sum(w.gender == "F" for w in all_w),
        "rates": s.staff_rates,
        "edu": {k: sum(w.education == k for w in all_w) for k in ("higher", "second", "special", "secondary")},
        "age": {"under31": sum(a <= 31 for a in ages), "from32to45": sum(32 <= a <= 45 for a in ages), "over46": sum(a >= 46 for a in ages)},
    }
    if q:
        base = base.filter((m.Worker.full_name.ilike(f"%{q}%")) | (m.Worker.position.ilike(f"%{q}%")))
    total, rows = page(base.order_by(m.Worker.full_name), page_, size)
    return {"stats": stats, "total": total, "items": [
        {"id": w.id, "fullName": w.full_name, "position": w.position, "birthDate": w.birth_date.isoformat(),
         "hiredDate": w.hired_date.isoformat(), "contractType": w.contract_type, "phone": w.phone,
         "education": w.education, "gender": w.gender} for w in rows]}


@router.get("/{sid}/tech", dependencies=[Depends(require_station_tab("tech"))])
def tech(sid: int, db: Session = Depends(get_db)):
    _st(db, sid)
    rows = db.query(m.ParkTrack).filter(m.ParkTrack.station_id == sid).order_by(m.ParkTrack.park, m.ParkTrack.id).all()
    parks: dict[str, list] = {}
    for r in rows:
        parks.setdefault(r.park, []).append({
            "id": r.id, "trackNo": r.track_no, "purpose": r.purpose, "from": r.arrow_from, "to": r.arrow_to,
            "lengthTotal": r.length_total, "usableLength": r.usable_length, "wagonCapacity": r.wagon_capacity,
            "insulation": r.insulation, "contactNetwork": r.contact_network, "alns": r.alns})
    return {"parks": parks, "images": []}


def cadastre_out(c: m.Cadastre | None) -> dict | None:
    if not c:
        return None
    v = lambda x: None if x in (None, "", "—") else x  # "—" is only a placeholder for NOT NULL columns
    return {"compiledAt": c.compiled_at.isoformat() if c.compiled_at else None, "passportNo": v(c.passport_no), "parcelNo": v(c.parcel_no),
            "location": v(c.location), "objectName": v(c.object_name), "category": v(c.category), "subcategory": v(c.subcategory),
            "useType": v(c.use_type), "landArea": c.land_area, "servitude": v(c.servitude), "m2Total": c.m2_total,
            "m2Legal": c.m2_legal, "m2InUse": c.m2_in_use, "buildings": c.buildings or []}


@router.get("/{sid}/cadastre", dependencies=[Depends(require_station_tab("cadastre"))])
def cadastre(sid: int, db: Session = Depends(get_db)):
    s = _st(db, sid)
    c = db.query(m.Cadastre).filter(m.Cadastre.station_id == sid).first()
    return {"cadastre": cadastre_out(c), "docs": _media(db, s)["docs"]}


@router.get("/{sid}/kpi", dependencies=[Depends(require_station_tab("kpi"))])
def kpi(sid: int, month: str | None = None, db: Session = Depends(get_db)):
    q = db.query(m.KpiRecord, m.Worker).join(m.Worker, m.Worker.id == m.KpiRecord.worker_id).filter(m.KpiRecord.station_id == sid)
    months = [r[0] for r in db.query(m.KpiRecord.month).filter(m.KpiRecord.station_id == sid).distinct().order_by(m.KpiRecord.month.desc())]
    month = month or (months[0] if months else None)
    q = q.filter(m.KpiRecord.month == month)
    return {"month": month, "months": months, "items": [
        {"id": k.id, "fullName": w.full_name, "position": w.position, "docs": k.docs, "total": sum(k.docs.values()),
         "plan": k.plan, "percent": k.percent, "status": k.status} for k, w in q.order_by(m.KpiRecord.percent.desc()).all()]}


class _NoSource(Exception):
    def __init__(self, reason: str):
        self.reason = reason


def _api_station(s: m.Station):
    """(api_name, branch, how) of the station in the MTU reporting system, or raises _NoSource / HTTP 502."""
    from .. import external
    if not external.enabled():
        raise _NoSource("not_configured")
    try:
        src = external.resolve(s)
    except external.ExternalError as ex:
        raise HTTPException(502, f"external_{ex}")
    if not src:
        raise _NoSource("not_mapped")
    return src


def _days(report: str, match, a: date, e: date) -> dict:
    from .. import external
    try:
        return external.days(report, match, a, e)
    except external.ExternalError as ex:
        raise HTTPException(502, f"external_{ex}")


def _meta(match, a: date, e: date, days: dict) -> dict:
    return {"source": "api", "apiStation": match["name"], "branch": match["branch"], "match": match["how"], "code": match["code"],
            "from": a.isoformat(), "to": e.isoformat(), "reported": len(days)}


def _freight_figures(days: dict) -> dict:
    """Indicator values for a set of daily freight records (None when there is nothing to compute from)."""
    if not days:
        return {k: None for k in ("loadWagons", "loadTons", "unloadWagons", "statWeight", "workingPark")}
    tot = lambda f: sum(v.get(f, 0) for v in days.values())
    load, tons = tot("load_all"), tot("tannaj_all")
    # wagons standing under loading + unloading: a stock per shift, averaged per day, then over the days
    park = [(v.get("und_load_all", 0) + v.get("und_unload_all", 0)) / max(1, v.get("_shifts", 1)) for v in days.values()]
    return {"loadWagons": load, "loadTons": tons, "unloadWagons": tot("unload_all"),
            "statWeight": round(tons / load, 1) if load else None, "workingPark": round(sum(park) / len(park), 1)}


# category number -> key of _freight_figures (None = not provided by the source yet)
CAT_API = {1: "loadWagons", 2: "loadTons", 3: "unloadWagons", 4: "statWeight", 5: None, 6: "workingPark", 7: None}


@router.get("/{sid}/indicators", dependencies=[Depends(require_station_tab("indicators"))])
def indicators(sid: int, year: int | None = None, month: int | None = None, db: Session = Depends(get_db)):
    """Year-to-date report (1 January .. end of the chosen month) vs the same period of the previous year."""
    st = _st(db, sid)
    today = date.today()
    year = year or today.year
    month = month or (today.month if year == today.year else 12)
    try:
        match = _api_station(st)
    except _NoSource as ns:
        return {"source": "none", "reason": ns.reason, "year": year, "month": month, "items": []}
    end = min(date(year + (month == 12), month % 12 + 1, 1) - timedelta(days=1), today)
    start = date(year, 1, 1)
    cur = _days("freight-report", match, start, end)
    prev_start, prev_end = date(year - 1, 1, 1), date(year - 1, end.month, min(end.day, 28 if end.month == 2 else end.day))
    prev = _days("freight-report", match, prev_start, prev_end) if prev_start >= API_HISTORY_START else {}
    fc, fp = _freight_figures(cur), _freight_figures(prev)
    items = []
    for cat, key in CAT_API.items():
        rc = fc.get(key) if key else None
        rp = fp.get(key) if key else None
        items.append({"category": cat, "key": CAT_NAMES[cat], "available": key is not None,
                      "prevReport": rp, "plan": None, "report": rc, "diffPlan": None,
                      "diffPrev": round(rc - rp, 1) if rc is not None and rp is not None else None})
    return {**_meta(match, start, end, cur), "year": year, "month": month, "prevFrom": prev_start.isoformat(),
            "prevTo": prev_end.isoformat(), "prevReported": len(prev), "items": items}


TRAFFIC_KINDS = {
    "moves": ("arrival", "departure"),          # received / dispatched (unit — trains or wagons — still being confirmed)
    "load": ("load_all", "unload_all"),         # wagons loaded / unloaded
    "waiting": ("und_load_all", "und_unload_all"),  # wagons standing under loading / unloading
}
API_HISTORY_START = date(2025, 1, 1)


@router.get("/{sid}/traffic", dependencies=[Depends(require_station_tab("traffic"))])
def traffic(sid: int, kind: str = "moves", mode: str = "days", start: str | None = None, end: str | None = None,
            db: Session = Depends(get_db)):
    from .. import external
    s = _st(db, sid)
    if kind not in TRAFFIC_KINDS or mode not in ("days", "months", "years"):
        raise HTTPException(400, "params")
    today = date.today()
    e = date.fromisoformat(end) if end else today
    if start:
        a = date.fromisoformat(start)
    else:
        a = e - timedelta(days=13) if mode == "days" else date(e.year, 1, 1) if mode == "months" else API_HISTORY_START
    a = max(a, API_HISTORY_START)
    try:
        match = _api_station(s)
    except _NoSource as ns:
        return {"source": "none", "reason": ns.reason, "rows": []}
    days = _days("freight-report", match, a, e)
    f_in, f_out = TRAFFIC_KINDS[kind]
    stock = kind == "waiting"  # wagons standing = a snapshot per shift: average it, never sum it
    cut = {"days": 10, "months": 7, "years": 4}[mode]
    buckets: dict[str, list[float]] = {}  # [in, out, reported days]
    d = a
    while d <= e:  # every period in range appears, also days without reports
        buckets.setdefault(d.isoformat()[:cut], [0, 0, 0])
        d += timedelta(days=1)
    for day, vals in days.items():
        k = max(1, vals.get("_shifts", 1)) if stock else 1
        bkt = buckets.setdefault(day[:cut], [0, 0, 0])
        bkt[0] += vals.get(f_in, 0) / k
        bkt[1] += vals.get(f_out, 0) / k
        bkt[2] += 1
    if stock:
        rows = [{"period": p, "in": round(v[0] / v[2], 1) if v[2] else 0, "out": round(v[1] / v[2], 1) if v[2] else 0} for p, v in sorted(buckets.items())]
        with_data = [r for p, r in zip(sorted(buckets), rows) if buckets[p][2]]
        totals = {"in": round(sum(r["in"] for r in with_data) / len(with_data), 1) if with_data else 0,
                  "out": round(sum(r["out"] for r in with_data) / len(with_data), 1) if with_data else 0}
    else:
        rows = [{"period": p, "in": int(v[0]), "out": int(v[1])} for p, v in sorted(buckets.items())]
        totals = {"in": sum(r["in"] for r in rows), "out": sum(r["out"] for r in rows)}
    return {**_meta(match, a, e, days), "aggregate": "avg" if stock else "sum", "rows": rows, "totals": totals}


@router.get("/{sid}/train-passes", dependencies=[Depends(require_station_tab("traffic"))])
def train_passes(sid: int, page_: int = Query(1, alias="page"), size: int = 10, db: Session = Depends(get_db)):
    q = db.query(m.TrainPass).filter(m.TrainPass.station_id == sid).order_by(m.TrainPass.at.desc())
    total, rows = page(q, page_, size)
    return {"total": total, "items": [{"id": r.id, "trainNo": r.train_no, "direction": r.direction, "at": r.at.isoformat(),
                                        "wagonsTotal": r.wagons_total, "wagonsDetected": r.wagons_detected} for r in rows]}


@router.get("/{sid}/emm", dependencies=[Depends(require_station_tab("emm"))])
def emm(sid: int, db: Session = Depends(get_db)):
    rows = db.query(m.EmmRoute).filter(m.EmmRoute.station_id == sid).order_by(m.EmmRoute.departed_at.desc()).all()
    return [{"id": r.id, "locomotive": r.locomotive, "series": r.series, "machinist": r.machinist, "route": r.route,
             "departedAt": r.departed_at.isoformat(), "arrivedAt": r.arrived_at.isoformat() if r.arrived_at else None,
             "fuelStart": r.fuel_start, "fuelEnd": r.fuel_end, "remains": r.fuel_end} for r in rows]


@router.get("/{sid}/kmo", dependencies=[Depends(require_station_tab("kmo"))])
def kmo(sid: int, status: str | None = None, role: str | None = None, type: str | None = None, month: str | None = None,
        material: str | None = None, q: str | None = None, db: Session = Depends(get_db)):
    base = db.query(m.KmoItem).filter(m.KmoItem.station_id == sid)
    if status:
        base = base.filter(m.KmoItem.status == status) if status not in ("open", "closed") else base.filter(m.KmoItem.usage == status)
    if role:
        base = base.filter(m.KmoItem.role == role)
    if type:
        base = base.filter(m.KmoItem.kmo_type == type)
    if month:
        base = base.filter(m.KmoItem.month == month)
    if material in ("related", "notRelated"):
        base = base.filter(m.KmoItem.material_related == (material == "related"))
    if q:
        base = base.filter(m.KmoItem.description.ilike(f"%{q}%"))
    rows = base.order_by(m.KmoItem.created_at.desc()).all()
    summary = {"open": sum(r.usage == "open" for r in rows), "closed": sum(r.usage == "closed" for r in rows),
               "rejected": sum(r.rejected for r in rows), "comments": sum(bool(r.comment) for r in rows)}
    by_role = {}
    for role_key in ("pd", "echk", "shn", "vchd"):
        rr = [r for r in rows if r.role == role_key]
        by_role[role_key] = {"total": len(rr), "done": sum(r.status == "done" for r in rr),
                             "notDone": sum(r.status == "not_done" for r in rr),
                             "other": sum(r.status not in ("done", "not_done") for r in rr)}
    return {"summary": summary, "byRole": by_role, "items": [
        {"id": r.id, "month": r.month, "role": r.role, "type": r.kmo_type, "number": r.number, "status": r.status,
         "usage": r.usage, "materialRelated": r.material_related, "rejected": r.rejected, "description": r.description,
         "comment": r.comment, "deadline": r.deadline.isoformat(), "createdAt": r.created_at.isoformat()} for r in rows]}


def finance_aggregate(db: Session, s: date, e: date, station_ids: list[int] | None):
    q = db.query(m.FinanceDaily).filter(m.FinanceDaily.day >= s, m.FinanceDaily.day <= e)
    if station_ids is not None:
        q = q.filter(m.FinanceDaily.station_id.in_(station_ids))
    rows = q.all()
    inc = {k: 0 for k in ("podacha", "manyovr", "promivka", "dopSbor")}
    fin = {k: 0 for k in ("emptyVagon", "overload", "notPlan", "notCleaning", "container")}
    fee = {k: 0 for k in ("local", "export", "import", "smgs")}
    ll = le = ul = ui = 0
    mass = 0.0
    for r in rows:
        ll += r.loaded_local; le += r.loaded_export; ul += r.unloaded_local; ui += r.unloaded_import; mass += r.loaded_mass
        for k in inc: inc[k] += r.income.get(k, 0)
        for k in fin: fin[k] += r.fines.get(k, 0)
        for k in fee: fee[k] += r.road_fee.get(k, 0)
    loaded = ll + le
    return {"loaded": {"local": ll, "export": le, "total": loaded},
            "unloaded": {"local": ul, "import": ui, "total": ul + ui},
            "income": inc, "incomeTotal": sum(inc.values()), "fines": fin, "finesTotal": sum(fin.values()),
            "loadedMass": round(mass, 1), "statLoad": round(mass / loaded, 2) if loaded else 0,
            "roadFee": fee, "roadFeeTotal": sum(fee.values())}


@router.get("/{sid}/finance", dependencies=[Depends(require_station_tab("finance"))])
def finance(sid: int, start: str | None = None, end: str | None = None, db: Session = Depends(get_db)):
    """Loaded / unloaded wagons (local vs CIS), loaded mass and income (pul_tushumi) from the MTU reporting API."""
    st = _st(db, sid)
    a, e = parse_range(start, end, "any")
    a = max(a, API_HISTORY_START)
    try:
        match = _api_station(st)
    except _NoSource as ns:
        return {"source": "none", "reason": ns.reason, "start": a.isoformat(), "end": e.isoformat()}
    days = _days("freight-report", match, a, e)
    tot = lambda f: sum(v.get(f, 0) for v in days.values())
    load, load_sng, unload, unload_sng, tons = tot("load_all"), tot("load_sng"), tot("unload_all"), tot("unload_sng"), tot("tannaj_all")
    daily = [{"day": d, "income": days[d].get("pul_tushumi", 0)} for d in sorted(days)]
    return {**_meta(match, a, e, days), "start": a.isoformat(), "end": e.isoformat(),
            "loaded": {"local": max(0, load - load_sng), "sng": load_sng, "total": load},
            "unloaded": {"local": max(0, unload - unload_sng), "sng": unload_sng, "total": unload},
            "income": tot("pul_tushumi"), "incomeDays": sum(1 for v in days.values() if v.get("pul_tushumi")),
            "loadedMass": tons, "statLoad": round(tons / load, 1) if load else None, "incomeDaily": daily}


@router.get("/{sid}/wagon-requests", dependencies=[Depends(require_station_tab("traffic"))])
def wagon_requests(sid: int, start: str | None = None, end: str | None = None, db: Session = Depends(get_db)):
    """Wagon supply requests vs fulfilled, per wagon type, plus the free-text removal log (uborka report)."""
    from ..external import WAGON_TYPES
    st = _st(db, sid)
    a, e = parse_range(start, end, "any")
    a = max(a, API_HISTORY_START)
    try:
        match = _api_station(st)
    except _NoSource as ns:
        return {"source": "none", "reason": ns.reason}
    days = _days("uborka-report", match, a, e)
    types = []
    for w in WAGON_TYPES:
        req = sum(v.get(f"zayavka_{w}", 0) for v in days.values())
        done = sum(v.get(f"done_{w}", 0) for v in days.values())
        types.append({"type": w, "requested": req, "done": done, "pct": round(done / req * 100) if req else None})
    req_all, done_all = sum(t["requested"] for t in types), sum(t["done"] for t in types)
    notes = [{"day": d, **n} for d in sorted(days, reverse=True) for n in days[d].get("_notes", [])][:60]
    return {**_meta(match, a, e, days), "types": types,
            "totals": {"requested": req_all, "done": done_all, "pct": round(done_all / req_all * 100) if req_all else None},
            "notes": notes}


@router.get("/{sid}/income", dependencies=[Depends(require_station_tab("income"))])
def income(sid: int, start: str | None = None, end: str | None = None, db: Session = Depends(get_db)):
    """Daily income vs fines series for the station."""
    s, e = parse_range(start, end, "any")
    rows = db.query(m.FinanceDaily).filter(m.FinanceDaily.station_id == sid, m.FinanceDaily.day >= s,
                                           m.FinanceDaily.day <= e).order_by(m.FinanceDaily.day).all()
    return [{"day": r.day.isoformat(), "income": sum(r.income.values()), "expense": sum(r.fines.values()),
             "roadFee": sum(r.road_fee.values())} for r in rows]


@router.get("/{sid}/access-roads", dependencies=[Depends(require_station_tab("roads"))])
def access_roads(sid: int, db: Session = Depends(get_db)):
    rows = db.query(m.AccessRoad).filter(m.AccessRoad.station_id == sid).all()
    return [{"id": r.id, "owner": r.owner, "inn": r.inn, "leader": r.leader, "email": r.email, "phone": r.phone,
             "distanceKm": r.distance_km, "length": {"total": r.length_total, "t1": r.length_t1, "t2": r.length_t2},
             "contract": {"date": r.contract_date.isoformat(), "start": r.contract_start.isoformat(),
                          "end": r.contract_end.isoformat(), "type": r.contract_type},
             "hasTechPassport": r.has_tech_passport, "hasInstruction": r.has_instruction, "junction": r.junction,
             "cargoPeriod": {"load": r.load_hours, "unload": r.unload_hours, "oper2": r.oper2_hours},
             "front": r.front, "wagonsAtOnce": r.wagons_at_once, "createdYear": r.created_year, "canceled": r.canceled}
            for r in rows]


@router.get("/{sid}/computers", dependencies=[Depends(require_station_tab("computers"))])
def computers(sid: int, db: Session = Depends(get_db)):
    rows = db.query(m.Computer).filter(m.Computer.station_id == sid).all()
    return {"total": len(rows), "online": sum(r.online for r in rows), "offline": sum(not r.online for r in rows),
            "items": [{"id": r.id, "company": r.company, "model": r.model, "monitor": r.monitor, "ups": r.ups,
                       "printer": r.printer, "inventoryNo": r.inventory_no, "radminId": r.radmin_id,
                       "anydeskId": r.anydesk_id, "positionType": r.position_type, "online": r.online,
                       "enteredAt": r.entered_at.isoformat()} for r in rows]}


@router.get("/{sid}/cameras", dependencies=[Depends(require_station_tab("cameras"))])
def station_cameras(sid: int, db: Session = Depends(get_db)):
    rows = db.query(m.Camera).filter(m.Camera.station_id == sid).all()
    return [{"id": r.id, "name": r.name, "streamUrl": r.stream_url, "online": r.online, "vendor": r.vendor} for r in rows]


@router.get("/{sid}/scales")
def station_scales(sid: int, db: Session = Depends(get_db)):
    return [{"id": s.id, "code": s.code, "kind": s.kind} for s in db.query(m.Scale).filter(m.Scale.station_id == sid)]
