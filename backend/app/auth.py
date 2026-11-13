import json
import os
import random
import re
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


PAGES = ["map", "dashboard", "cameras"]
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


# switched off for everyone until an admin turns them on (the sections that are still being built)
DEFAULT_HIDDEN_TABS = ["kpi", "emm", "kmo", "income"]
HIDDEN_TABS_KEY = "hidden_station_tabs"
_hidden_cache: tuple[float, list[str]] = (0.0, [])


def hidden_station_tabs() -> list[str]:
    """Station tabs an admin has switched off for all users (cached for a few seconds)."""
    global _hidden_cache
    if _hidden_cache[0] > time.time():
        return _hidden_cache[1]
    from .db import SessionLocal
    from .models import Setting
    with SessionLocal() as db:
        row = db.get(Setting, HIDDEN_TABS_KEY)
    tabs = [t for t in STATION_TABS if t in (row.value if row and isinstance(row.value, list) else DEFAULT_HIDDEN_TABS)]
    _hidden_cache = (time.time() + 5, tabs)
    return tabs


def set_hidden_station_tabs(db: Session, tabs: list[str]) -> list[str]:
    global _hidden_cache
    from .models import Setting
    clean = [t for t in STATION_TABS if t in tabs]
    row = db.get(Setting, HIDDEN_TABS_KEY) or Setting(key=HIDDEN_TABS_KEY)
    row.value = clean
    db.add(row)
    db.commit()
    _hidden_cache = (0.0, [])
    _mirror_setting(HIDDEN_TABS_KEY, clean)
    return clean


# ---- the station card's layout: tabs in coloured groups, in the order admins set for everyone ----
DEFAULT_LAYOUT = [
    {"id": "about", "color": "#0d9488", "title": None, "tabs": ["home", "pano", "cameras"]},
    {"id": "infra", "color": "#6366f1", "title": None, "tabs": ["tech", "cadastre", "roads"]},
    {"id": "team", "color": "#0ea5e9", "title": None, "tabs": ["staff", "computers"]},
    {"id": "ops", "color": "#d97706", "title": None, "tabs": ["traffic", "indicators", "finance"]},
    {"id": "wip", "color": "#64748b", "title": None, "tabs": ["kpi", "emm", "kmo", "income"]},
]
LAYOUT_KEY = "station_layout"
_layout_cache: tuple[float, list[dict]] = (0.0, [])
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
_ID = re.compile(r"^[a-z0-9_-]{1,24}$")


def clean_layout(groups) -> list[dict]:
    """Every tab exactly once, groups without tabs dropped; tabs nobody placed go to the last group."""
    out, seen, ids = [], set(), set()
    for g in (groups if isinstance(groups, list) else [])[:12]:
        if not isinstance(g, dict):
            continue
        tabs = []
        for t in g.get("tabs") or []:
            if isinstance(t, str) and t in STATION_TABS and t not in seen:
                tabs.append(t)
                seen.add(t)
        if not tabs:
            continue
        gid = str(g.get("id") or "")
        if not _ID.match(gid) or gid in ids:
            gid = f"g{len(out) + 1}"
            while gid in ids:
                gid += "x"
        ids.add(gid)
        color = g.get("color") if isinstance(g.get("color"), str) and _HEX.match(g["color"]) else "#64748b"
        title = str(g.get("title") or "").strip()[:32] or None
        out.append({"id": gid, "color": color, "title": title, "tabs": tabs})
    if not out:
        return json.loads(json.dumps(DEFAULT_LAYOUT))
    order = [t for g in DEFAULT_LAYOUT for t in g["tabs"]]
    out[-1]["tabs"] += [t for t in order if t not in seen]
    return out


def station_layout() -> list[dict]:
    global _layout_cache
    if _layout_cache[0] > time.time():
        return _layout_cache[1]
    from .db import SessionLocal
    from .models import Setting
    with SessionLocal() as db:
        row = db.get(Setting, LAYOUT_KEY)
    layout = clean_layout(row.value if row and isinstance(row.value, list) else DEFAULT_LAYOUT)
    _layout_cache = (time.time() + 5, layout)
    return layout


def set_station_layout(db: Session, groups) -> list[dict]:
    global _layout_cache
    from .models import Setting
    clean = clean_layout(groups)
    row = db.get(Setting, LAYOUT_KEY) or Setting(key=LAYOUT_KEY)
    row.value = clean
    db.add(row)
    db.commit()
    _layout_cache = (0.0, [])
    _mirror_setting(LAYOUT_KEY, clean)
    return clean


# admin settings are mirrored to data/settings.json so that `python -m app.seed` (which drops all tables) keeps them
SETTINGS_FILE = os.path.join(os.getenv("DATA_DIR", "data"), "settings.json")


def _mirror_setting(key: str, value):
    try:
        with open(SETTINGS_FILE, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        data = {}
    data[key] = value
    try:
        os.makedirs(os.path.dirname(SETTINGS_FILE) or ".", exist_ok=True)
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
    except OSError:
        pass


def restore_settings(db: Session) -> int:
    """Used by the seed: puts the mirrored admin settings back."""
    from .models import Setting
    try:
        with open(SETTINGS_FILE, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return 0
    n = 0
    for key in (HIDDEN_TABS_KEY, LAYOUT_KEY):
        if key in data:
            db.merge(Setting(key=key, value=data[key]))
            n += 1
    return n


def user_base_tabs(user: User) -> list[str]:
    """What the user is allowed in principle (before the global switch-off)."""
    if user.role in ADMIN_ROLES or user.allowed_station_tabs is None:
        return list(STATION_TABS)
    return [t for t in STATION_TABS if t in user.allowed_station_tabs]


def user_station_tabs(user: User) -> list[str]:
    """Tabs the user actually sees: admins — all; others — allowed tabs minus the ones switched off for everyone,
    plus the switched-off tabs this user was explicitly granted."""
    if user.role in ADMIN_ROLES:
        return list(STATION_TABS)
    allowed, hidden, granted = user_base_tabs(user), hidden_station_tabs(), user.granted_station_tabs or []
    return [t for t in STATION_TABS if (t in allowed and t not in hidden) or t in granted]


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
