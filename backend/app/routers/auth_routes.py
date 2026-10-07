import logging
import random
import re
import time
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import (check_captcha, create_tokens, current_user, decode, hash_password, new_captcha, user_pages,
                    user_station_tabs, verify_password)
from ..db import get_db
from ..models import LoginHistory, Message, User

router = APIRouter(prefix="/api", tags=["auth"])
log = logging.getLogger("silkrail.auth")


class LoginIn(BaseModel):
    username: str
    password: str
    captchaId: str | None = None
    captcha: str | None = None


class RefreshIn(BaseModel):
    refreshToken: str


def user_out(u: User) -> dict:
    return {"id": u.id, "username": u.username, "fullName": u.full_name, "role": u.role, "theme": u.theme, "lang": u.lang,
            "pages": user_pages(u), "stationTabs": user_station_tabs(u)}


def _ua_parts(ua: str) -> tuple[str, str]:
    browser = next((b for b in ["Edg", "OPR", "Chrome", "Firefox", "Safari"] if b in ua), "Boshqa")
    browser = {"Edg": "Edge", "OPR": "Opera"}.get(browser, browser)
    device = "Mobile" if re.search(r"Mobile|Android|iPhone", ua) else ("Mac" if "Mac OS" in ua else ("Windows" if "Windows" in ua else "Linux/Boshqa"))
    return browser, device


@router.get("/auth/captcha")
def captcha():
    cid, image = new_captcha()
    return {"captchaId": cid, "image": image}


@router.post("/auth/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    if not check_captcha(body.captchaId, body.captcha):
        raise HTTPException(400, "captcha")
    u = db.query(User).filter(User.username == body.username).first()
    if not u or not verify_password(body.password, u.password_hash):
        raise HTTPException(401, "invalid_credentials")
    b, d = _ua_parts(request.headers.get("user-agent", ""))
    db.add(LoginHistory(user_id=u.id, ip=request.client.host if request.client else "-", browser=b, device=d))
    db.commit()
    return {**create_tokens(u), "user": user_out(u)}


@router.post("/auth/refresh")
def refresh(body: RefreshIn, db: Session = Depends(get_db)):
    uid = decode(body.refreshToken, "refresh")
    u = db.get(User, uid)
    if not u:
        raise HTTPException(401, "User not found")
    return create_tokens(u)


# ---------- forgot password (code delivered via Telegram bot in prod; logged in dev) ----------
_RESET: dict[str, dict] = {}


class ForgotStart(BaseModel):
    username: str


class ForgotVerify(BaseModel):
    username: str
    code: str


class ForgotReset(BaseModel):
    username: str
    token: str
    password: str


PW_RE = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{7,}$")


@router.post("/auth/forgot-password/start")
def fp_start(body: ForgotStart, db: Session = Depends(get_db)):
    u = db.query(User).filter(User.username == body.username).first()
    if u:
        code = f"{random.randint(0, 999999):06d}"
        _RESET[body.username] = {"code": code, "exp": time.time() + 300, "token": None}
        # TODO: send via Telegram bot (u.telegram_chat_id). For dev we log it.
        log.warning("Password reset code for %s: %s", body.username, code)
        print(f"[SilkRail] reset code for {body.username}: {code}")
    return {"ok": True, "bot": "@SilkRailBot"}


@router.post("/auth/forgot-password/verify")
def fp_verify(body: ForgotVerify):
    r = _RESET.get(body.username)
    if not r or r["exp"] < time.time() or r["code"] != body.code:
        raise HTTPException(400, "code_wrong")
    r["token"] = f"{random.getrandbits(64):x}"
    return {"token": r["token"]}


@router.post("/auth/forgot-password/reset")
def fp_reset(body: ForgotReset, db: Session = Depends(get_db)):
    r = _RESET.get(body.username)
    if not r or r["token"] != body.token:
        raise HTTPException(400, "token")
    if not PW_RE.match(body.password):
        raise HTTPException(400, "weak")
    u = db.query(User).filter(User.username == body.username).first()
    u.password_hash = hash_password(body.password)
    db.commit()
    _RESET.pop(body.username, None)
    return {"ok": True}


# ---------- me ----------
@router.get("/user/me")
def me(u: User = Depends(current_user)):
    return user_out(u)


class MePatch(BaseModel):
    theme: str | None = None
    lang: str | None = None


@router.patch("/user/me")
def me_patch(body: MePatch, u: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.theme in ("light", "dark"):
        u.theme = body.theme
    if body.lang in ("uz", "ru", "en"):
        u.lang = body.lang
    db.commit()
    return user_out(u)


class ChangePw(BaseModel):
    oldPassword: str
    newPassword: str


@router.post("/auth/change-password")
def change_password(body: ChangePw, u: User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(body.oldPassword, u.password_hash):
        raise HTTPException(400, "old_wrong")
    if body.oldPassword == body.newPassword:
        raise HTTPException(400, "same")
    if not PW_RE.match(body.newPassword):
        raise HTTPException(400, "weak")
    u.password_hash = hash_password(body.newPassword)
    db.commit()
    return {"ok": True}


@router.post("/auth/unlock")
def unlock(body: dict, u: User = Depends(current_user)):
    if not verify_password(body.get("password", ""), u.password_hash):
        raise HTTPException(400, "invalid_credentials")
    return {"ok": True}


@router.get("/user/login-history")
def login_history(u: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.query(LoginHistory).filter(LoginHistory.user_id == u.id).order_by(LoginHistory.at.desc()).limit(100).all()
    return [{"id": r.id, "ip": r.ip, "browser": r.browser, "device": r.device, "at": r.at.isoformat()} for r in rows]


@router.get("/user/messages")
def messages(u: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.query(Message).filter(Message.user_id == u.id).order_by(Message.at.desc()).all()
    return [{"id": r.id, "title": r.title, "body": r.body, "isRead": r.is_read, "at": r.at.isoformat()} for r in rows]


@router.post("/user/messages/{mid}/read")
def message_read(mid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    r = db.get(Message, mid)
    if r and r.user_id == u.id:
        r.is_read = True
        db.commit()
    return {"ok": True}
