"""Connecting Argus and attaching its cameras to stations (admins only). See app/argus.py."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import argus
from .. import models as m
from ..auth import ADMIN_ROLES, require_roles
from ..db import get_db

router = APIRouter(prefix="/api/argus", tags=["argus"], dependencies=[Depends(require_roles(*ADMIN_ROLES))])


class ConnectIn(BaseModel):
    url: str = Field(min_length=8, max_length=256)
    # empty keeps the stored key (e.g. when only the address changes)
    key: str = Field(default="", max_length=256)


class AttachIn(BaseModel):
    ids: list[str] = Field(default=[], max_length=2000)


class CameraIn(BaseModel):
    # the camera's name on this site; empty goes back to the name it has in Argus
    title: str = Field(default="", max_length=200)


def _fail(e: argus.ArgusError):
    raise HTTPException(502 if e.code != "argus_bad_url" else 422, e.code)


def _state(db: Session, error: str | None = None) -> dict:
    conn = argus.connection(db)
    return {"connected": bool(conn), "url": conn["url"] if conn else "", "error": error,
            "attached": db.query(m.ArgusCamera).count()}


@router.get("")
def state(db: Session = Depends(get_db)):
    """Whether Argus is connected. The key is never sent back."""
    return _state(db)


@router.put("")
def connect(body: ConnectIn, db: Session = Depends(get_db)):
    """Saves the address and the key after checking them against Argus."""
    old = argus.connection(db)
    key = body.key.strip() or (old["key"] if old else "")
    if not key:
        raise HTTPException(422, "argus_key_required")
    try:
        url = argus.clean_url(body.url)
        found = argus.fetch_cameras(url, key)
    except argus.ArgusError as e:
        _fail(e)
    argus.set_connection(db, url, key)
    db.commit()
    argus.save_mirror(db)
    return {**_state(db), "cameras": len(found)}


@router.delete("")
def disconnect(db: Session = Depends(get_db)):
    """Forgets the key and detaches every Argus camera from the stations."""
    db.query(m.ArgusCamera).delete(synchronize_session=False)
    argus.set_connection(db, None, None)
    db.commit()
    argus.save_mirror(db)
    return _state(db)


@router.get("/cameras")
def cameras(db: Session = Depends(get_db)):
    """Cameras the key opens, each with the station it is attached to (if any)."""
    if not argus.connection(db):
        raise HTTPException(409, "argus_not_connected")
    try:
        rows = argus.cameras(db, fresh=True)
    except argus.ArgusError as e:
        _fail(e)
    q = db.query(m.ArgusCamera.argus_id, m.Station.id, m.Station.name).join(m.Station, m.Station.id == m.ArgusCamera.station_id)
    where = {aid: {"stationId": sid, "station": name} for aid, sid, name in q}
    return [{**c, **where.get(c["id"], {"stationId": None, "station": None})} for c in rows]


def _camera(db: Session, cid: int) -> m.ArgusCamera:
    row = db.get(m.ArgusCamera, cid)
    if not row:
        raise HTTPException(404, "camera")
    return row


@router.patch("/cameras/{cid}")
def rename(cid: int, body: CameraIn, db: Session = Depends(get_db)):
    """Gives an attached camera its own name here; Argus keeps calling it what it did."""
    row = _camera(db, cid)
    row.title = body.title.strip() or None
    db.commit()
    argus.save_mirror(db)
    return {"id": row.id, "title": row.title, "name": row.title or row.name}


@router.delete("/cameras/{cid}")
def detach(cid: int, db: Session = Depends(get_db)):
    """Takes the camera off its station. In Argus nothing changes; it can be added again."""
    db.delete(_camera(db, cid))
    db.commit()
    argus.save_mirror(db)
    return {"ok": True}


@router.put("/stations/{sid}")
def attach(sid: int, body: AttachIn, db: Session = Depends(get_db)):
    """Sets which Argus cameras belong to the station. A camera sits on one station: ticking it here moves it."""
    if not db.get(m.Station, sid):
        raise HTTPException(404, "station")
    if not argus.connection(db):
        raise HTTPException(409, "argus_not_connected")
    try:
        known = {c["id"]: c for c in argus.cameras(db, fresh=True)}
    except argus.ArgusError as e:
        _fail(e)
    wanted = [i for i in dict.fromkeys(body.ids) if i in known]
    db.query(m.ArgusCamera).filter(m.ArgusCamera.station_id == sid, m.ArgusCamera.argus_id.notin_(wanted or [""])) \
        .delete(synchronize_session=False)
    have = {r.argus_id: r for r in db.query(m.ArgusCamera).filter(m.ArgusCamera.argus_id.in_(wanted or [""]))}
    for i in wanted:
        row = have.get(i) or m.ArgusCamera(argus_id=i)
        row.station_id, row.name = sid, known[i]["name"]
        db.add(row)
    db.commit()
    argus.save_mirror(db)
    return {"attached": len(wanted)}
