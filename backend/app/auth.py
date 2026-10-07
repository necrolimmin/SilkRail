import os
import random
import secrets
import string
import time
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from .db import get_db
from .models import User

SECRET_KEY = os.getenv("SECRET_KEY", "change-me-railvision-dev-secret")
ALGO = "HS256"
ACCESS_MIN = int(os.getenv("ACCESS_TOKEN_MINUTES", "60"))
REFRESH_DAYS = int(os.getenv("REFRESH_TOKEN_DAYS", "7"))

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer = HTTPBearer(auto_error=False)


def hash_password(p: str) -> str:
    return pwd.hash(p)


def verify_password(p: str, h: str) -> bool:
    return pwd.verify(p, h)


def _token(sub: str, kind: str, delta: timedelta) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": sub, "type": kind, "iat": now, "exp": now + delta}, SECRET_KEY, algorithm=ALGO)


def create_tokens(user: User) -> dict:
    return {
        "accessToken": _token(str(user.id), "access", timedelta(minutes=ACCESS_MIN)),
        "refreshToken": _token(str(user.id), "refresh", timedelta(days=REFRESH_DAYS)),
    }


def decode(token: str, kind: str) -> int:
    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=[ALGO])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    if data.get("type") != kind:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong token type")
    return int(data["sub"])


def current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)
) -> User:
    if not cred:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    uid = decode(cred.credentials, "access")
    user = db.get(User, uid)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    return user


def require_roles(*roles: str):
    def dep(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Forbidden")
        return user
    return dep


PAGES = ["map", "dashboard", "analytics", "cameras"]
ADMIN_ROLES = ("superadmin", "admin")


def user_pages(user: User) -> list[str]:
    """Pages the user may open; admins and users without a restriction see everything."""
    if user.role in ADMIN_ROLES or user.allowed_pages is None:
        return list(PAGES)
    return [p for p in PAGES if p in user.allowed_pages]


def require_page(page: str):
    def dep(user: User = Depends(current_user)) -> User:
        if page not in user_pages(user):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "page_forbidden")
        return user
    return dep


# tabs of the station card (keys match the frontend StationModal)
STATION_TABS = ["home", "staff", "tech", "cadastre", "kpi", "indicators", "traffic", "emm", "kmo", "income", "finance",
                "roads", "computers", "cameras", "pano"]


def user_station_tabs(user: User) -> list[str]:
    if user.role in ADMIN_ROLES or user.allowed_station_tabs is None:
        return list(STATION_TABS)
    return [t for t in STATION_TABS if t in user.allowed_station_tabs]


def require_station_tab(tab: str):
    def dep(user: User = Depends(current_user)) -> User:
        if tab not in user_station_tabs(user):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "tab_forbidden")
        return user
    return dep


# ---------------- Captcha (in-memory, SVG) ----------------
_CAPTCHAS: dict[str, tuple[str, float]] = {}
CAPTCHA_TTL = 300


def _font(size: int):
    from PIL import ImageFont
    for path in ("DejaVuSansMono-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
                 "/usr/share/fonts/TTF/DejaVuSansMono-Bold.ttf", "arialbd.ttf"):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default(size=size)


def new_captcha() -> tuple[str, str]:
    """Returns (captcha_id, data-URL PNG). Text is rasterised so it is not readable from markup."""
    import base64
    import io
    from PIL import Image, ImageDraw, ImageFilter

    text = "".join(random.choices("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", k=5))
    cid = secrets.token_urlsafe(16)
    _CAPTCHAS[cid] = (text, time.time() + CAPTCHA_TTL)
    for k, (_, exp) in list(_CAPTCHAS.items()):
        if exp < time.time():
            _CAPTCHAS.pop(k, None)

    w, h = 170, 56
    img = Image.new("RGB", (w, h), (238, 247, 246))
    d = ImageDraw.Draw(img)
    for _ in range(7):
        d.line([(random.randint(0, w), random.randint(0, h)), (random.randint(0, w), random.randint(0, h))],
               fill=(15, 118, 110), width=random.randint(1, 2))
    font = _font(30)
    for i, ch in enumerate(text):
        tile = Image.new("RGBA", (40, 48), (0, 0, 0, 0))
        ImageDraw.Draw(tile).text((6, 4), ch, font=font, fill=(11, 59, 58))
        tile = tile.rotate(random.randint(-25, 25), resample=Image.BICUBIC, expand=False)
        img.paste(tile, (10 + i * 31, random.randint(0, 8)), tile)
    for _ in range(160):
        d.point((random.randint(0, w - 1), random.randint(0, h - 1)), fill=(15, 118, 110))
    img = img.filter(ImageFilter.SMOOTH)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return cid, "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def check_captcha(cid: str | None, answer: str | None) -> bool:
    if os.getenv("DISABLE_CAPTCHA") == "1":
        return True
    if not cid or not answer:
        return False
    item = _CAPTCHAS.pop(cid, None)
    if not item:
        return False
    text, exp = item
    return exp >= time.time() and text.upper() == answer.strip().upper()
