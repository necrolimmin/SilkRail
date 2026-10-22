from datetime import date, datetime
from sqlalchemy import String, Integer, Float, Boolean, Date, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base


# ---------- Auth ----------
class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(128))
    role: Mapped[str] = mapped_column(String(32), default="viewer")  # superadmin|admin|moderator|viewer
    password_hash: Mapped[str] = mapped_column(String(256))
    telegram_chat_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    theme: Mapped[str] = mapped_column(String(16), default="light")
    lang: Mapped[str] = mapped_column(String(4), default="uz")
    allowed_pages: Mapped[list | None] = mapped_column(JSON, nullable=True)  # None = all pages
    allowed_station_tabs: Mapped[list | None] = mapped_column(JSON, nullable=True)  # None = all station card tabs
    # tabs switched off for everyone that this user may still open (explicit exception, wins over the global switch)
    granted_station_tabs: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Setting(Base):
    """Small key/value store for app-wide switches (e.g. which station tabs are hidden from users)."""
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict | list | None] = mapped_column(JSON, nullable=True)


class LoginHistory(Base):
    __tablename__ = "login_history"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    ip: Mapped[str] = mapped_column(String(64))
    browser: Mapped[str] = mapped_column(String(128))
    device: Mapped[str] = mapped_column(String(128))
    at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ---------- Structure ----------
class Mtu(Base):
    """Mintaqaviy temir yo'l uzeli (regional railway node)."""
    __tablename__ = "mtus"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(16))
    name: Mapped[str] = mapped_column(String(128))
    short: Mapped[str] = mapped_column(String(32))
    color: Mapped[str] = mapped_column(String(16))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    railway_length_km: Mapped[float] = mapped_column(Float, default=0)
    utilization: Mapped[float] = mapped_column(Float, default=0)
    stations: Mapped[list["Station"]] = relationship(back_populates="mtu")


class Station(Base):
    __tablename__ = "stations"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), index=True)
    esr_code: Mapped[str] = mapped_column(String(16), index=True)
    mtu_id: Mapped[int] = mapped_column(ForeignKey("mtus.id"))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    line: Mapped[str] = mapped_column(String(64))
    road_code: Mapped[str] = mapped_column(String(8), default="74")
    network_mark: Mapped[str] = mapped_column(String(16), default="7445")
    point_type: Mapped[str] = mapped_column(String(32))
    station_role: Mapped[str] = mapped_column(String(32))
    station_class: Mapped[str] = mapped_column(String(32))
    category: Mapped[str] = mapped_column(String(32))
    cargo_operations: Mapped[bool] = mapped_column(Boolean, default=True)
    transit_point: Mapped[bool] = mapped_column(Boolean, default=False)
    is_operator: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_hub: Mapped[bool] = mapped_column(Boolean, default=False)
    kind: Mapped[str] = mapped_column(String(8), default="station")  # station|halt|yard
    op_codes: Mapped[list] = mapped_column(JSON, default=list)
    inn: Mapped[str] = mapped_column(String(16))
    leader_name: Mapped[str] = mapped_column(String(128))
    leader_phone: Mapped[str] = mapped_column(String(32))
    leader_email: Mapped[str] = mapped_column(String(128))
    corp_leader_name: Mapped[str] = mapped_column(String(128))
    image_url: Mapped[str | None] = mapped_column(String(256), nullable=True)
    panorama_url: Mapped[str | None] = mapped_column(String(256), nullable=True)
    staff_rates: Mapped[int] = mapped_column(Integer, default=0)
    country: Mapped[str] = mapped_column(String(64), default="O'zbekiston")
    road_name: Mapped[str] = mapped_column(String(128), default="O'zbekiston Temir Yo'llari (O'TY)")
    # on the official scheme of its MTU (see mtu_toshkent.py); other points of the MTU are halts, yards, sidings
    mtu_listed: Mapped[bool] = mapped_column(Boolean, default=False)
    mtu: Mapped[Mtu] = relationship(back_populates="stations")


class StationMedia(Base):
    """Photos and 360° panoramas uploaded by admins (files live in static/uploads/stations/<id>/)."""
    __tablename__ = "station_media"
    id: Mapped[int] = mapped_column(primary_key=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"), index=True)
    kind: Mapped[str] = mapped_column(String(8))  # photo | pano
    url: Mapped[str] = mapped_column(String(256))
    title: Mapped[str | None] = mapped_column(String(160), nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Company(Base):
    """Korxona / enterprise shown on the map."""
    __tablename__ = "companies"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    kind: Mapped[str] = mapped_column(String(16))  # fuel | industrial | depot | other
    fuel_mode: Mapped[str | None] = mapped_column(String(16), nullable=True)  # loading|unloading|both
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    inn: Mapped[str] = mapped_column(String(16))
    leader: Mapped[str] = mapped_column(String(128))
    phone: Mapped[str] = mapped_column(String(32))


class Worker(Base):
    __tablename__ = "workers"
    id: Mapped[int] = mapped_column(primary_key=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"), index=True)
    full_name: Mapped[str] = mapped_column(String(128))
    position: Mapped[str] = mapped_column(String(128))
    gender: Mapped[str] = mapped_column(String(1))
    birth_date: Mapped[date] = mapped_column(Date)
    education: Mapped[str] = mapped_column(String(16))  # higher|second|special|secondary
    contract_type: Mapped[str] = mapped_column(String(32))
    hired_date: Mapped[date] = mapped_column(Date)
    phone: Mapped[str] = mapped_column(String(32))


class KpiRecord(Base):
    __tablename__ = "kpi_records"
    id: Mapped[int] = mapped_column(primary_key=True)
    worker_id: Mapped[int] = mapped_column(ForeignKey("workers.id"), index=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"), index=True)
    month: Mapped[str] = mapped_column(String(7))  # YYYY-MM
    docs: Mapped[dict] = mapped_column(JSON)  # {"GU-27": n, "GU-27e": n, "GU-45": n}
    plan: Mapped[int] = mapped_column(Integer)
    percent: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(16))  # confirmed|cancelled|pending


class IndicatorValue(Base):
    """Station performance indicators (7 categories) — report / plan by year & month."""
    __tablename__ = "indicator_values"
    id: Mapped[int] = mapped_column(primary_key=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"), index=True)
    category: Mapped[int] = mapped_column(Integer)  # 1..7
    year: Mapped[int] = mapped_column(Integer)
    month: Mapped[int] = mapped_column(Integer)
    plan: Mapped[float] = mapped_column(Float)
    fact: Mapped[float] = mapped_column(Float)


class TrafficDaily(Base):
    __tablename__ = "traffic_daily"
    id: Mapped[int] = mapped_column(primary_key=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"), index=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    trains_in: Mapped[int] = mapped_column(Integer)
    trains_out: Mapped[int] = mapped_column(Integer)
    wagons_in: Mapped[int] = mapped_column(Integer)
    wagons_out: Mapped[int] = mapped_column(Integer)
    wagons_loaded: Mapped[int] = mapped_column(Integer)
    wagons_unloaded: Mapped[int] = mapped_column(Integer)


class TrainPass(Base):
    __tablename__ = "train_passes"
    id: Mapped[int] = mapped_column(primary_key=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"), index=True)
    train_no: Mapped[str] = mapped_column(String(16))
    direction: Mapped[str] = mapped_column(String(128))
    at: Mapped[datetime] = mapped_column(DateTime, index=True)
    wagons_total: Mapped[int] = mapped_column(Integer)
    wagons_detected: Mapped[int] = mapped_column(Integer)


class EmmRoute(Base):
    """Mashinistning elektron marshruti (driver's electronic route)."""
    __tablename__ = "emm_routes"
    id: Mapped[int] = mapped_column(primary_key=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"), index=True)
    locomotive: Mapped[str] = mapped_column(String(32))
    series: Mapped[str] = mapped_column(String(32))
    machinist: Mapped[str] = mapped_column(String(128))
    route: Mapped[str] = mapped_column(String(160))
    departed_at: Mapped[datetime] = mapped_column(DateTime)
    arrived_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    fuel_start: Mapped[float] = mapped_column(Float)
    fuel_end: Mapped[float] = mapped_column(Float)


class KmoItem(Base):
    """Oylik nazorat ko'rigi (monthly control inspection) findings."""
    __tablename__ = "kmo_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"), index=True)
    month: Mapped[str] = mapped_column(String(7))
    role: Mapped[str] = mapped_column(String(16))  # pd|echk|shn|vchd|pto|passtrans|dc|vokzal
    kmo_type: Mapped[str] = mapped_column(String(8))  # kmo|kkmo
    number: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16))  # done|not_done|repetition|moved|not_controlled
    usage: Mapped[str] = mapped_column(String(8))  # open|closed
    material_related: Mapped[bool] = mapped_column(Boolean)
    rejected: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[str] = mapped_column(Text)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    deadline: Mapped[date] = mapped_column(Date)
    created_at: Mapped[date] = mapped_column(Date)


class FinanceDaily(Base):
    __tablename__ = "finance_daily"
    id: Mapped[int] = mapped_column(primary_key=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"), index=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    loaded_local: Mapped[int] = mapped_column(Integer)
    loaded_export: Mapped[int] = mapped_column(Integer)
    unloaded_local: Mapped[int] = mapped_column(Integer)
    unloaded_import: Mapped[int] = mapped_column(Integer)
    loaded_mass: Mapped[float] = mapped_column(Float)
    income: Mapped[dict] = mapped_column(JSON)  # podacha, manyovr, promivka, dopSbor
    fines: Mapped[dict] = mapped_column(JSON)   # emptyVagon, overload, notPlan, notCleaning, container
    road_fee: Mapped[dict] = mapped_column(JSON)  # local, export, import, smgs


class YearMetric(Base):
    """Income & expense metrics per station per year: last_year / plan / fact."""
    __tablename__ = "year_metrics"
    id: Mapped[int] = mapped_column(primary_key=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"), index=True)
    year: Mapped[int] = mapped_column(Integer)
    metric: Mapped[str] = mapped_column(String(32))  # staff|income|loadedWagons|expense|unloadedWagons
    last_year: Mapped[float] = mapped_column(Float)
    plan: Mapped[float] = mapped_column(Float)
    fact: Mapped[float] = mapped_column(Float)


class FuelOperation(Base):
    __tablename__ = "fuel_operations"
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"), index=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    op: Mapped[str] = mapped_column(String(12))  # loading|unloading
    scope: Mapped[str] = mapped_column(String(8))  # local|export
    product: Mapped[str] = mapped_column(String(64))
    wagons: Mapped[int] = mapped_column(Integer)
    tons: Mapped[float] = mapped_column(Float)
    plan_wagons: Mapped[int] = mapped_column(Integer)
    given_wagons: Mapped[int] = mapped_column(Integer)


class AccessRoad(Base):
    __tablename__ = "access_roads"
    id: Mapped[int] = mapped_column(primary_key=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"), index=True)
    owner: Mapped[str] = mapped_column(String(160))
    inn: Mapped[str] = mapped_column(String(16))
    leader: Mapped[str] = mapped_column(String(128))
    email: Mapped[str] = mapped_column(String(128))
    phone: Mapped[str] = mapped_column(String(32))
    distance_km: Mapped[float] = mapped_column(Float)
    length_total: Mapped[float] = mapped_column(Float)
    length_t1: Mapped[float] = mapped_column(Float)
    length_t2: Mapped[float] = mapped_column(Float)
    contract_date: Mapped[date] = mapped_column(Date)
    contract_start: Mapped[date] = mapped_column(Date)
    contract_end: Mapped[date] = mapped_column(Date)
    contract_type: Mapped[str] = mapped_column(String(32))
    has_tech_passport: Mapped[bool] = mapped_column(Boolean)
    has_instruction: Mapped[bool] = mapped_column(Boolean)
    junction: Mapped[str] = mapped_column(String(128))
    load_hours: Mapped[float] = mapped_column(Float)
    unload_hours: Mapped[float] = mapped_column(Float)
    oper2_hours: Mapped[float] = mapped_column(Float)
    front: Mapped[int] = mapped_column(Integer)
    wagons_at_once: Mapped[int] = mapped_column(Integer)
    created_year: Mapped[int] = mapped_column(Integer)
    canceled: Mapped[bool] = mapped_column(Boolean, default=False)


class Computer(Base):
    __tablename__ = "computers"
    id: Mapped[int] = mapped_column(primary_key=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"), index=True)
    company: Mapped[str] = mapped_column(String(160))
    model: Mapped[str] = mapped_column(String(64))
    monitor: Mapped[str] = mapped_column(String(64))
    ups: Mapped[str] = mapped_column(String(64))
    printer: Mapped[str] = mapped_column(String(64))
    inventory_no: Mapped[str] = mapped_column(String(32))
    radmin_id: Mapped[str] = mapped_column(String(32))
    anydesk_id: Mapped[str] = mapped_column(String(32))
    position_type: Mapped[str] = mapped_column(String(64))
    online: Mapped[bool] = mapped_column(Boolean)
    entered_at: Mapped[date] = mapped_column(Date)


class CameraGroup(Base):
    __tablename__ = "camera_groups"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128))


class Camera(Base):
    __tablename__ = "cameras"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"), index=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("camera_groups.id"))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    stream_url: Mapped[str] = mapped_column(String(256))
    online: Mapped[bool] = mapped_column(Boolean, default=True)
    vendor: Mapped[str] = mapped_column(String(32))


class Crossing(Base):
    __tablename__ = "crossings"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    km: Mapped[float] = mapped_column(Float)
    is_protected: Mapped[bool] = mapped_column(Boolean)


class MapWarning(Base):
    __tablename__ = "map_warnings"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(160))
    level: Mapped[str] = mapped_column(String(8))  # low|mid|high
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class MapMarker(Base):
    """Custom map marker placed by an admin."""
    __tablename__ = "map_markers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    kind: Mapped[str] = mapped_column(String(16), default="point")  # map_routes.MARKER_KINDS
    color: Mapped[str] = mapped_column(String(16), default="#2563eb")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class TrackWork(Base):
    """Km-based track works (Ish qo'shish)."""
    __tablename__ = "track_works"
    id: Mapped[int] = mapped_column(primary_key=True)
    line: Mapped[str] = mapped_column(String(64))
    km_start: Mapped[int] = mapped_column(Integer)
    km_end: Mapped[int] = mapped_column(Integer)
    picket_start: Mapped[int] = mapped_column(Integer)
    picket_end: Mapped[int] = mapped_column(Integer)
    repair_type: Mapped[str] = mapped_column(String(64))
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Scale(Base):
    """Tarozi — wagon scale."""
    __tablename__ = "scales"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32))
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"), index=True)
    kind: Mapped[str] = mapped_column(String(8))  # dynamic|static
    has_ai_camera: Mapped[bool] = mapped_column(Boolean, default=True)


class WagonWeighing(Base):
    __tablename__ = "wagon_weighings"
    id: Mapped[int] = mapped_column(primary_key=True)
    scale_id: Mapped[int] = mapped_column(ForeignKey("scales.id"), index=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"), index=True)
    wagon_number: Mapped[str] = mapped_column(String(16), index=True)
    weighed_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    norm_ton: Mapped[float] = mapped_column(Float)
    scale_ton: Mapped[float] = mapped_column(Float)
    cargo_ton: Mapped[float] = mapped_column(Float)
    extra_ton: Mapped[float] = mapped_column(Float)
    customs: Mapped[str | None] = mapped_column(String(8), nullable=True)  # import|export
    detected: Mapped[bool] = mapped_column(Boolean, default=True)
    confirmed: Mapped[bool] = mapped_column(Boolean, default=True)


class ParkTrack(Base):
    __tablename__ = "park_tracks"
    id: Mapped[int] = mapped_column(primary_key=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"), index=True)
    park: Mapped[str] = mapped_column(String(64))
    track_no: Mapped[str] = mapped_column(String(16))
    purpose: Mapped[str] = mapped_column(String(128))
    arrow_from: Mapped[str] = mapped_column(String(16))
    arrow_to: Mapped[str] = mapped_column(String(16))
    length_total: Mapped[int] = mapped_column(Integer)
    usable_length: Mapped[int] = mapped_column(Integer)
    wagon_capacity: Mapped[int] = mapped_column(Integer)
    insulation: Mapped[str] = mapped_column(String(32))
    contact_network: Mapped[bool] = mapped_column(Boolean)
    alns: Mapped[bool] = mapped_column(Boolean)


class Cadastre(Base):
    __tablename__ = "cadastres"
    id: Mapped[int] = mapped_column(primary_key=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"), unique=True)
    compiled_at: Mapped[date] = mapped_column(Date)
    passport_no: Mapped[str] = mapped_column(String(32))
    parcel_no: Mapped[str] = mapped_column(String(32))
    location: Mapped[str] = mapped_column(String(200))
    object_name: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(64))
    subcategory: Mapped[str | None] = mapped_column(String(64), nullable=True)
    use_type: Mapped[str] = mapped_column(String(64))
    land_area: Mapped[float] = mapped_column(Float)
    servitude: Mapped[str | None] = mapped_column(String(200), nullable=True)
    m2_total: Mapped[float] = mapped_column(Float)
    m2_legal: Mapped[float] = mapped_column(Float)
    m2_in_use: Mapped[float] = mapped_column(Float)
    buildings: Mapped[list] = mapped_column(JSON, default=list)
