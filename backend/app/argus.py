"""Cameras from Argus (the video surveillance system) shown on station cards.

An admin enters the Argus address and an API key once; then cameras the key opens can be attached to stations.
The key stays on this server: a browser gets only a temporary link to Argus's player (one camera, limited time).

The database is the working copy; the connection and the attachments are mirrored to data/argus.json keyed by
the station's ESR code, so `python -m app.seed` (which drops all tables) can put them back.
"""
import json
import logging
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from . import models as m

log = logging.getLogger("silkrail.argus")

DATA_DIR = os.getenv("DATA_DIR", "data")
MIRROR_FILE = os.path.join(DATA_DIR, "argus.json")
SETTING_KEY = "argus"
TIMEOUT = 8
LIST_SECONDS = 30  # how long Argus's camera list is reused
LINK_SECONDS = 24 * 60 * 60  # a player link is asked for this long...
LINK_REUSE_SECONDS = 12 * 60 * 60  # ...and handed out while at least this much of it is left

_lock = threading.Lock()
_list_cache: tuple[float, str, list[dict]] = (0.0, "", [])
_links: dict[str, tuple[float, str]] = {}  # argus camera id -> (expires at, player path with the token)


class ArgusError(Exception):
    """`code` is one of: argus_unreachable, argus_bad_key, argus_bad_answer."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def clean_url(url: str) -> str:
    url = (url or "").strip().rstrip("/")
    if not url.lower().startswith(("http://", "https://")):
        raise ArgusError("argus_bad_url")
    return url


def _call(url: str, key: str, path: str, method: str = "GET"):
    req = urllib.request.Request(url + path, method=method, headers={"X-Api-Key": key, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise ArgusError("argus_bad_key" if e.code in (401, 403) else "argus_bad_answer") from e
    except (urllib.error.URLError, OSError) as e:
        raise ArgusError("argus_unreachable") from e
    except ValueError as e:  # not JSON: the address is some other site
        raise ArgusError("argus_bad_answer") from e


def fetch_cameras(url: str, key: str) -> list[dict]:
    """Cameras the key opens, straight from Argus."""
    rows = _call(url, key, "/api/ext/cameras")
    if not isinstance(rows, list):
        raise ArgusError("argus_bad_answer")
    return [{"id": str(r["id"]), "name": r.get("name") or "", "unit": r.get("unit") or "",
             "online": r.get("online") is not False and r.get("enabled", True) is not False} for r in rows if isinstance(r, dict) and r.get("id")]


# ---- the connection ----
def connection(db) -> dict | None:
    row = db.get(m.Setting, SETTING_KEY)
    v = row.value if row else None
    return v if isinstance(v, dict) and v.get("url") and v.get("key") else None


def set_connection(db, url: str | None, key: str | None):
    global _list_cache
    row = db.get(m.Setting, SETTING_KEY) or m.Setting(key=SETTING_KEY)
    row.value = {"url": url, "key": key} if url and key else None
    db.add(row)
    with _lock:
        _list_cache = (0.0, "", [])
        _links.clear()


def cameras(db, fresh: bool = False) -> list[dict]:
    """Argus's camera list, reused for a short while so every opened station card does not ask Argus again."""
    global _list_cache
    conn = connection(db)
    if not conn:
        return []
    with _lock:
        until, for_url, rows = _list_cache
    if not fresh and until > time.time() and for_url == conn["url"]:
        return rows
    rows = fetch_cameras(conn["url"], conn["key"])
    with _lock:
        _list_cache = (time.time() + LIST_SECONDS, conn["url"], rows)
    return rows


def player_url(conn: dict, camera_id: str) -> str | None:
    """A link to Argus's player for one camera; it carries a temporary token, never the key."""
    now = time.time()
    with _lock:
        exp, path = _links.get(camera_id, (0.0, ""))
    if exp - now < LINK_REUSE_SECONDS:
        try:
            cid = urllib.parse.quote(camera_id, safe="")
            got = _call(conn["url"], conn["key"], f"/api/ext/cameras/{cid}/link?seconds={LINK_SECONDS}", "POST")
            path = got["embed_path"]
        except (ArgusError, KeyError, TypeError) as e:
            log.warning("argus link for %s: %s", camera_id, e)
            return None
        with _lock:
            _links[camera_id] = (now + LINK_SECONDS, path)
    return conn["url"] + path


def station_cameras(db, rows: list[m.ArgusCamera], lang: str | None = None) -> list[dict]:
    """Attached cameras as the frontend's player expects them. A camera Argus no longer gives is shown offline."""
    conn = connection(db)
    if not rows or not conn:
        return []
    try:
        live = {c["id"]: c for c in cameras(db)}
    except ArgusError as e:
        log.warning("argus: %s", e.code)
        live = {}
    out = []
    for r in rows:
        info = live.get(r.argus_id)
        url = player_url(conn, r.argus_id) if info else None
        if url and lang:
            url += f"&lang={urllib.parse.quote(lang)}"
        argus_name = (info or {}).get("name") or r.name
        if url and r.title:  # the player writes the camera's name over the picture: let it write ours
            url += f"&title={urllib.parse.quote(r.title)}"
        out.append({"id": f"argus-{r.id}", "name": r.title or argus_name, "vendor": "Argus",
                    "online": bool(info and info["online"] and url), "streamUrl": "", "embedUrl": url,
                    "stationId": r.station_id, "argusId": r.id, "argusName": argus_name, "title": r.title})
    return out


# ---- the JSON mirror ----
def save_mirror(db):
    conn = connection(db)
    stations: dict[str, list] = {}
    q = db.query(m.ArgusCamera, m.Station.esr_code).join(m.Station, m.Station.id == m.ArgusCamera.station_id)
    for cam, esr in q.order_by(m.ArgusCamera.id):
        stations.setdefault(esr, []).append({"id": cam.argus_id, "name": cam.name, "title": cam.title})
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(MIRROR_FILE, "w", encoding="utf-8") as f:
        json.dump({"url": conn["url"] if conn else None, "key": conn["key"] if conn else None, "stations": stations},
                  f, ensure_ascii=False, indent=1)


def restore(db) -> int:
    """Used by the seed: puts the connection and the attached cameras back. Returns the number of cameras."""
    if not os.path.exists(MIRROR_FILE):
        return 0
    with open(MIRROR_FILE, encoding="utf-8") as f:
        data = json.load(f)
    if data.get("url") and data.get("key"):
        set_connection(db, data["url"], data["key"])
    n = 0
    for esr, cams in (data.get("stations") or {}).items():
        s = db.query(m.Station).filter(m.Station.esr_code == esr).first()
        if not s:
            continue
        for c in cams:
            db.add(m.ArgusCamera(station_id=s.id, argus_id=c["id"], name=c.get("name") or "", title=c.get("title")))
            n += 1
    return n
