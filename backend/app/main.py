import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from .db import Base, engine
from .routers import auth_routes, map_routes, station_routes, dashboard_routes, analytics_routes, users_routes, records_routes

Base.metadata.create_all(engine)
# lightweight migrations for databases created before these columns existed
_NEW_COLUMNS = [
    ("users", "allowed_pages", "JSON"),
    ("users", "allowed_station_tabs", "JSON"),
    ("users", "granted_station_tabs", "JSON"),
    ("stations", "country", "VARCHAR(64) DEFAULT 'O''zbekiston'"),
    ("stations", "road_name", "VARCHAR(128) DEFAULT 'O''zbekiston Temir Yo''llari (O''TY)'"),
    ("stations", "mtu_listed", "BOOLEAN DEFAULT FALSE"),
]
with engine.begin() as conn:
    for table, col, ddl in _NEW_COLUMNS:
        if col not in {c["name"] for c in inspect(conn).get_columns(table)}:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))
    # project was renamed RailVision -> SilkRail
    conn.execute(text("UPDATE stations SET leader_email = REPLACE(leader_email, '@railvision.uz', '@silkrail.uz') "
                      "WHERE leader_email LIKE '%@railvision.uz'"))

app = FastAPI(title="SilkRail API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

@app.middleware("http")
async def isolate_uploads(request, call_next):
    """Uploaded files (incl. virtual tours with their own HTML/JS) are served sandboxed: an opaque origin that cannot
    read the app's storage or tokens, even when opened directly. CORS lets the sandboxed tour load its own files."""
    resp = await call_next(request)
    if request.url.path.startswith("/static/uploads/"):
        resp.headers["Content-Security-Policy"] = "sandbox allow-scripts allow-pointer-lock allow-popups allow-orientation-lock"
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["X-Content-Type-Options"] = "nosniff"
    return resp


for r in (auth_routes, map_routes, station_routes, dashboard_routes, analytics_routes, users_routes, records_routes):
    app.include_router(r.router)
app.include_router(users_routes.settings_router)

os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.on_event("startup")
def _warm_external_cache():
    from . import external
    external.warm_up()


@app.get("/api/health")
def health():
    return {"status": "ok"}
