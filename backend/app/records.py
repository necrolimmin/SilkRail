"""Station records entered by admins (staff list, staff rates, park tracks).

The database is the working copy; every change is mirrored to data/station_records.json keyed by the station's
ESR code, so `python -m app.seed` (which drops all tables) can put the real data back.
"""
import json
import os
from datetime import date

from . import models as m

DATA_DIR = os.getenv("DATA_DIR", "data")
RECORDS_FILE = os.path.join(DATA_DIR, "station_records.json")

WORKER_FIELDS = ("full_name", "position", "gender", "birth_date", "education", "contract_type", "hired_date", "phone")
CADASTRE_FIELDS = ("compiled_at", "passport_no", "parcel_no", "location", "object_name", "category", "subcategory", "use_type",
                   "land_area", "servitude", "m2_total", "m2_legal", "m2_in_use", "buildings")
ROAD_FIELDS = ("owner", "inn", "leader", "email", "phone", "distance_km", "length_total", "length_t1", "length_t2", "contract_date",
               "contract_start", "contract_end", "contract_type", "has_tech_passport", "has_instruction", "junction", "load_hours",
               "unload_hours", "oper2_hours", "front", "wagons_at_once", "created_year", "canceled")
ROAD_DATES = ("contract_date", "contract_start", "contract_end")
TRACK_FIELDS = ("park", "track_no", "purpose", "arrow_from", "arrow_to", "length_total", "usable_length", "wagon_capacity",
                "insulation", "contact_network", "alns")


def load() -> dict:
    if os.path.exists(RECORDS_FILE):
        with open(RECORDS_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def _dump(v):
    return v.isoformat() if isinstance(v, date) else v


def save_station(db, s: m.Station):
    """Snapshot one station's records into the JSON mirror."""
    data = load()
    workers = db.query(m.Worker).filter(m.Worker.station_id == s.id).order_by(m.Worker.id).all()
    tracks = db.query(m.ParkTrack).filter(m.ParkTrack.station_id == s.id).order_by(m.ParkTrack.id).all()
    cad = db.query(m.Cadastre).filter(m.Cadastre.station_id == s.id).first()
    roads = db.query(m.AccessRoad).filter(m.AccessRoad.station_id == s.id).order_by(m.AccessRoad.id).all()
    data[s.esr_code] = {
        "roads": [{f: _dump(getattr(r, f)) for f in ROAD_FIELDS} for r in roads],
        "staffRates": s.staff_rates,
        "cadastre": {f: _dump(getattr(cad, f)) for f in CADASTRE_FIELDS} if cad else None,
        "workers": [{f: _dump(getattr(w, f)) for f in WORKER_FIELDS} for w in workers],
        "tracks": [{f: getattr(t, f) for f in TRACK_FIELDS} for t in tracks],
    }
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(RECORDS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)


def remove_station(esr: str):
    """Forget a deleted station's records in the JSON mirror."""
    data = load()
    if data.pop(esr, None) is not None:
        with open(RECORDS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)


def restore(db) -> int:
    """Used by the seed: re-inserts saved records for stations that exist. Returns the number of stations restored."""
    n = 0
    for esr, rec in load().items():
        s = db.query(m.Station).filter(m.Station.esr_code == esr).first()
        if not s:
            continue
        s.staff_rates = rec.get("staffRates", s.staff_rates)
        for w in rec.get("workers", []):
            db.add(m.Worker(station_id=s.id, **{**w, "birth_date": date.fromisoformat(w["birth_date"]),
                                                  "hired_date": date.fromisoformat(w["hired_date"])}))
        for t in rec.get("tracks", []):
            db.add(m.ParkTrack(station_id=s.id, **t))
        if "roads" in rec:  # replaces the synthetic roads the seed may have generated for this station
            db.query(m.AccessRoad).filter(m.AccessRoad.station_id == s.id).delete(synchronize_session=False)
            for r in rec["roads"]:
                db.add(m.AccessRoad(station_id=s.id, **{**r, **{k: date.fromisoformat(r[k]) for k in ROAD_DATES}}))
        cad = rec.get("cadastre")
        if cad:
            db.query(m.Cadastre).filter(m.Cadastre.station_id == s.id).delete(synchronize_session=False)
            db.add(m.Cadastre(station_id=s.id, **{**cad, "compiled_at": date.fromisoformat(cad["compiled_at"]) if cad.get("compiled_at") else None}))
        n += 1
    return n
