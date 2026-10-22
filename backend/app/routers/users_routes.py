from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import (ADMIN_ROLES, PAGES, STATION_TABS, current_user, hash_password, hidden_station_tabs, require_roles,
                    set_hidden_station_tabs, user_base_tabs, user_pages)
from ..db import get_db
from ..models import LoginHistory, MapMarker, Message, StationMedia, TrackWork, User
from .auth_routes import PW_RE

router = APIRouter(prefix="/api/admin/users", tags=["users"], dependencies=[Depends(require_roles(*ADMIN_ROLES))])
ROLES = ["superadmin", "admin", "moderator", "viewer"]


def admin_user_out(u: User) -> dict:
    return {"id": u.id, "username": u.username, "fullName": u.full_name, "role": u.role,
            "pages": user_pages(u), "restricted": u.role not in ADMIN_ROLES and u.allowed_pages is not None,
            "stationTabs": user_base_tabs(u), "tabsRestricted": u.role not in ADMIN_ROLES and u.allowed_station_tabs is not None,
            "grantedTabs": [t for t in STATION_TABS if t in (u.granted_station_tabs or [])],
            "createdAt": u.created_at.isoformat() if u.created_at else None}


def _check_role(role: str, me: User):
    if role not in ROLES:
        raise HTTPException(400, "role")
    if role == "superadmin" and me.role != "superadmin":
        raise HTTPException(403, "role")


def _clean_pages(pages: list[str] | None) -> list[str] | None:
    return None if pages is None else [p for p in PAGES if p in pages]


def _clean_tabs(tabs: list[str] | None) -> list[str] | None:
    return None if tabs is None else [t for t in STATION_TABS if t in tabs]


class UserIn(BaseModel):
    username: str
    fullName: str
    password: str
    role: str = "viewer"
    pages: list[str] | None = None  # None = all pages
    stationTabs: list[str] | None = None  # None = all station card tabs
    grantedTabs: list[str] | None = None  # switched-off tabs this user may still open


class UserPatch(BaseModel):
    fullName: str | None = None
    password: str | None = None
    role: str | None = None
    pages: list[str] | None = None
    allPages: bool = False  # true -> drop the restriction
    stationTabs: list[str] | None = None
    allStationTabs: bool = False
    grantedTabs: list[str] | None = None


@router.get("")
def list_users(db: Session = Depends(get_db)):
    return [admin_user_out(u) for u in db.query(User).order_by(User.id)]


@router.get("/pages")
def pages():
    return PAGES


@router.post("")
def create_user(body: UserIn, me: User = Depends(current_user), db: Session = Depends(get_db)):
    username = body.username.strip()
    if not username or not body.fullName.strip():
        raise HTTPException(400, "required")
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(400, "username_taken")
    if not PW_RE.match(body.password):
        raise HTTPException(400, "weak")
    _check_role(body.role, me)
    u = User(username=username, full_name=body.fullName.strip(), role=body.role,
             password_hash=hash_password(body.password), allowed_pages=_clean_pages(body.pages),
             allowed_station_tabs=_clean_tabs(body.stationTabs), granted_station_tabs=_clean_tabs(body.grantedTabs) or None)
    db.add(u)
    db.commit()
    return admin_user_out(u)


@router.patch("/{uid}")
def update_user(uid: int, body: UserPatch, me: User = Depends(current_user), db: Session = Depends(get_db)):
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "user")
    if u.role == "superadmin" and me.role != "superadmin":
        raise HTTPException(403, "role")
    if body.fullName is not None and body.fullName.strip():
        u.full_name = body.fullName.strip()
    if body.role is not None and body.role != u.role:
        if u.id == me.id:
            raise HTTPException(400, "self")
        _check_role(body.role, me)
        u.role = body.role
    if body.password:
        if not PW_RE.match(body.password):
            raise HTTPException(400, "weak")
        u.password_hash = hash_password(body.password)
    if body.allPages:
        u.allowed_pages = None
    elif body.pages is not None:
        u.allowed_pages = _clean_pages(body.pages)
    if body.allStationTabs:
        u.allowed_station_tabs = None
    elif body.stationTabs is not None:
        u.allowed_station_tabs = _clean_tabs(body.stationTabs)
    if body.grantedTabs is not None:
        u.granted_station_tabs = _clean_tabs(body.grantedTabs) or None
    db.commit()
    return admin_user_out(u)


@router.delete("/{uid}")
def delete_user(uid: int, me: User = Depends(current_user), db: Session = Depends(get_db)):
    u = db.get(User, uid)
    if not u:
        return {"ok": True}
    if u.id == me.id:
        raise HTTPException(400, "self")
    if u.role == "superadmin" and me.role != "superadmin":
        raise HTTPException(403, "role")
    db.query(LoginHistory).filter(LoginHistory.user_id == uid).delete(synchronize_session=False)
    db.query(Message).filter(Message.user_id == uid).delete(synchronize_session=False)
    for model in (TrackWork, MapMarker, StationMedia):
        db.query(model).filter(model.created_by == uid).update({model.created_by: None}, synchronize_session=False)
    db.delete(u)
    db.commit()
    return {"ok": True}


# ---------- app-wide switch: station card tabs hidden from all regular users ----------
settings_router = APIRouter(prefix="/api/admin/station-tabs", tags=["settings"], dependencies=[Depends(require_roles(*ADMIN_ROLES))])


class HiddenTabsIn(BaseModel):
    hidden: list[str]


@settings_router.get("")
def get_station_tabs():
    return {"tabs": STATION_TABS, "hidden": hidden_station_tabs()}


@settings_router.put("")
def put_station_tabs(body: HiddenTabsIn, db: Session = Depends(get_db)):
    return {"tabs": STATION_TABS, "hidden": set_hidden_station_tabs(db, body.hidden)}
