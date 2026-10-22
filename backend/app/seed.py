"""Deterministic synthetic seed data for SilkRail.

Run: python -m app.seed   (drops & recreates all tables)
"""
import math
import os
import random
from datetime import date, datetime, timedelta

from .db import Base, engine, SessionLocal
from . import models as m
from .auth import hash_password
from .geo import MTUS
from .network import build_network, dist_km

R = random.Random(2026)
TODAY = date.today()
START = date(TODAY.year - 1, 1, 1)

FIRST_M = ["Aziz", "Bekzod", "Jasur", "Sardor", "Otabek", "Sherzod", "Doston", "Rustam", "Farrux", "Jamshid",
           "Ulug'bek", "Akmal", "Nodir", "Sanjar", "Behruz", "Islom", "Javlon", "Umid", "Anvar", "Oybek"]
FIRST_F = ["Dilnoza", "Madina", "Gulnora", "Nigora", "Shahnoza", "Malika", "Zarina", "Kamola", "Sevara", "Nodira",
           "Feruza", "Mohira", "Laylo", "Dildora", "Munisa"]
LAST = ["Karimov", "Rahimov", "Tursunov", "Yusupov", "Aliyev", "Qodirov", "Ergashev", "Nazarov", "Saidov",
        "Hasanov", "Xolmatov", "Mirzayev", "Abdullayev", "Sultonov", "Ismoilov", "Jo'rayev", "Umarov", "To'xtayev",
        "Normatov", "Boboyev"]
POSITIONS = ["Stansiya navbatchisi", "Yuk xazinachisi", "Tovar kassiri", "Manyovr dispetcheri", "Signalchi",
             "Poezdlar tuzuvchisi", "Vagon ko'ruvchi", "Yo'l montyori", "Elektromexanik", "Operator",
             "Stansiya boshlig'i o'rinbosari", "Hisobchi"]
CONTRACTS = ["Asosiy", "Ortiqcha ish o'rni", "O'rindoshlik", "Muddatli"]
PRODUCTS_FUEL = ["Benzin AI-92", "Benzin AI-95", "Dizel yoqilg'isi", "Suyultirilgan gaz", "Mazut", "Aviakerosin"]
REPAIR_TYPES = ["Kapital ta'mir", "O'rta ta'mir", "Joriy ta'mir", "Rels almashtirish", "Shpal almashtirish",
                "Ballast tozalash"]
KMO_TEXT = [
    "Strelka o'tkazgichining izolyatsiyasi shikastlangan", "Perron yoritgichi ishlamaydi",
    "Kontakt tarmog'i osmasida kuchlanish pasaygan", "Svetofor linzasi ifloslangan",
    "Yo'l kengligi me'yordan chetga chiqqan", "Vagon tormoz kolodkasi yeyilgan",
    "Kutish zalida isitish tizimi nosoz", "Aloqa kabeli qudug'i qopqog'i yo'q",
    "Shpal mahkamlagichlari bo'shagan", "Yong'in xavfsizligi stendi yangilanmagan",
]


def person(gender=None):
    g = gender or R.choice("MMMF")
    first = R.choice(FIRST_M if g == "M" else FIRST_F)
    last = R.choice(LAST)
    if g == "F":
        last = last + "a"
    father = R.choice(FIRST_M)
    suffix = "o‘g‘li" if g == "M" else "qizi"
    return f"{last} {first} {father} {suffix}", g


def phone():
    return f"+998 {R.choice(['90','91','93','94','97','99','88','33'])} {R.randint(100,999)} {R.randint(10,99)} {R.randint(10,99)}"


def interp(a, b, t, jitter=0.03):
    return (a[0] + (b[0] - a[0]) * t + R.uniform(-jitter, jitter) * 0.3,
            a[1] + (b[1] - a[1]) * t + R.uniform(-jitter, jitter) * 0.3)


def daterange(a, b):
    d = a
    while d <= b:
        yield d
        d += timedelta(days=1)


def seasonal(d: date, base: float) -> float:
    s = 1 + 0.15 * math.sin((d.timetuple().tm_yday / 365) * 2 * math.pi)
    w = 0.85 if d.weekday() >= 5 else 1.0
    return max(0.0, base * s * w * R.uniform(0.75, 1.25))


def run():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    db = SessionLocal()

    # ---------- users ----------
    admin = m.User(username="admin", full_name="Tizim Administratori", role="superadmin",
                   password_hash=hash_password("Admin123"))
    viewer = m.User(username="viewer", full_name="Kuzatuvchi Foydalanuvchi", role="viewer",
                    password_hash=hash_password("Viewer123"))
    db.add_all([admin, viewer])
    db.flush()
    db.add_all([
        m.Message(user_id=admin.id, title="SilkRail'ga xush kelibsiz",
                  body="Tizim muvaffaqiyatli ishga tushirildi. Xarita va dashboard bo'limlarini ko'rib chiqing."),
        m.Message(user_id=admin.id, title="KMO hisobotlari",
                  body="Joriy oy uchun oylik nazorat ko'rigi natijalari yuklandi."),
    ])

    # ---------- MTU ----------
    mtu_by_code = {}
    for code, name, short, color, lat, lng in MTUS:
        x = m.Mtu(code=code, name=name, short=short, color=color, lat=lat, lng=lng,
                  railway_length_km=0, utilization=round(R.uniform(62, 94), 1))
        db.add(x)
        mtu_by_code[code] = x
    db.flush()

    # ---------- Railway network & stations (real OSM geometry when available) ----------
    net_stations, net_lines, source = build_network(R)
    lines_by_id = {ln["id"]: ln for ln in net_lines}
    stations: dict[str, m.Station] = {}
    used_esr = {s["esr"] for s in net_stations if s["esr"]}
    esr_counter = 720000

    def make_station(ns):
        nonlocal esr_counter
        hub = ns["hub"]
        esr = ns["esr"]
        if not esr or esr in {st.esr_code for st in stations.values()}:
            esr_counter += R.randint(7, 60)
            while str(esr_counter) in used_esr:
                esr_counter += 1
            esr = str(esr_counter)
        leader, _ = person("M")
        corp, _ = person("M")
        halt = ns["kind"] == "halt"
        role = R.choice(["Oraliq", "Uchastka", "Saralash", "Yuk", "Yo'lovchi"]) if hub else ("Yo'lovchi" if halt else R.choice(["Oraliq", "Oraliq", "Yuk"]))
        st = m.Station(
            name=ns["name"], esr_code=esr, mtu_id=mtu_by_code[ns["mtu"]].id, lat=ns["lat"], lng=ns["lng"], line=ns["line"],
            point_type="To'xtash punkti" if halt else "Ajratilgan", station_role=role,
            station_class="Stansiya" if hub or (not halt and R.random() > .4) else ("Bekat" if halt else "Raz'ezd"),
            category=R.choice(["Oliy", "Birinchi"]) if hub else R.choice(["Ikkinchi", "Uchinchi", "To'rtinchi", "Beshinchi"]),
            cargo_operations=hub or (not halt and R.random() > .45), transit_point=hub and R.random() > .5,
            is_operator=True, is_active=R.random() > .08, is_hub=hub, kind=ns["kind"],
            op_codes=["П", "Б"] if halt else sorted(R.sample(["1", "2", "3", "4", "5", "6", "8", "9", "10", "П", "Б", "О", "8н", "10н"], k=R.randint(1, 5))),
            inn=str(R.randint(200000000, 309999999)),
            leader_name=leader, leader_phone=phone(), leader_email=f"st{esr}@silkrail.uz",
            corp_leader_name=corp, image_url=None,
            panorama_url="/static/panorama-demo.jpg" if hub else None,
            staff_rates=R.randint(40, 220) if hub else R.randint(3, 30),
        )
        db.add(st)
        return st

    for ns in net_stations:
        key = f"{ns['name']}|{ns['esr'] or round(ns['lat'], 2)}"
        if key in stations:  # same station mapped twice -> keep first
            continue
        stations[key] = make_station(ns)
    db.flush()
    st_list = list(stations.values())
    hubs = [s for s in st_list if s.is_hub] or sorted(st_list, key=lambda s: -s.staff_rates)[:15]
    for h in hubs:
        h.is_hub = True
    print(f"network: {source}; stations: {len(st_list)} (hubs {len(hubs)}); lines: {len(net_lines)}")

    def nearest_station(lat, lng):
        return min(st_list, key=lambda s: (s.lat - lat) ** 2 + ((s.lng - lng) * 0.77) ** 2)

    def point_on_line(ln, frac):
        path = ln["path"]
        segs = [dist_km(a, b) for a, b in zip(path, path[1:])]
        target, acc = sum(segs) * frac, 0.0
        for (a, b), d in zip(zip(path, path[1:]), segs):
            if acc + d >= target and d > 0:
                t = (target - acc) / d
                return a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, target
            acc += d
        return path[-1][0], path[-1][1], acc

    # railway length per MTU and MTU-coloured line pieces (precomputed for the map)
    mtu_code_by_id = {v.id: k for k, v in mtu_by_code.items()}
    mtu_features = []
    for ln in net_lines:
        cur, seg = None, []
        for a, b in zip(ln["path"], ln["path"][1:]):
            mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            code = mtu_code_by_id[nearest_station(*mid).mtu_id]
            mt = mtu_by_code[code]
            mt.railway_length_km = round(mt.railway_length_km + dist_km(a, b), 1)
            if code != cur:
                if len(seg) > 1:
                    mtu_features.append((ln, cur, seg))
                seg, cur = [a], code
            seg.append(b)
        if len(seg) > 1:
            mtu_features.append((ln, cur, seg))

    # ---------- Companies ----------
    comp_names = ["Neft baza", "Yoqilg'i terminali", "Sement zavodi", "Paxta tozalash", "Don mahsulotlari",
                  "Metall konstruksiya", "Qurilish materiallari", "Kimyo zavodi", "Logistika markazi", "Lokomotiv deposi"]
    companies = []
    for s in R.sample(st_list, k=min(90, len(st_list))):
        base = R.choice(comp_names)
        kind = "fuel" if base in ("Neft baza", "Yoqilg'i terminali") else ("depot" if "deposi" in base else R.choice(["industrial", "other"]))
        c = m.Company(name=f"\"{s.name} {base}\" MChJ", kind=kind,
                      fuel_mode=R.choice(["loading", "unloading", "both"]) if kind == "fuel" else None,
                      station_id=s.id, lat=s.lat + R.uniform(-.008, .008), lng=s.lng + R.uniform(-.008, .008),
                      inn=str(R.randint(300000000, 309999999)), leader=person()[0], phone=phone())
        companies.append(c)
    # guarantee at least 25 fuel companies
    for s in R.sample(hubs, k=min(len(hubs), 14)):
        companies.append(m.Company(name=f"\"{s.name} Neft\" AJ filiali", kind="fuel", fuel_mode="both", station_id=s.id,
                                   lat=s.lat + R.uniform(-.006, .006), lng=s.lng + R.uniform(-.006, .006),
                                   inn=str(R.randint(300000000, 309999999)), leader=person()[0], phone=phone()))
    db.add_all(companies)
    db.flush()

    # ---------- Workers + KPI ----------
    # real staff is entered in the app (or imported from Excel) and restored from data/station_records.json;
    # synthetic demo staff only with SEED_DEMO_STAFF=1
    months = [(TODAY.replace(day=1) - timedelta(days=30 * i)).strftime("%Y-%m") for i in range(6)]
    if os.getenv("SEED_DEMO_STAFF") == "1":
        workers_rows = []
        for s in st_list:
            n = R.randint(25, 60) if s.is_hub else R.randint(3, 12)
            for _ in range(n):
                name, g = person()
                age = R.randint(20, 62)
                workers_rows.append(dict(
                    station_id=s.id, full_name=name, position=R.choice(POSITIONS), gender=g,
                    birth_date=date(TODAY.year - age, R.randint(1, 12), R.randint(1, 28)),
                    education=R.choices(["higher", "second", "special", "secondary"], [40, 6, 34, 20])[0],
                    contract_type=R.choices(CONTRACTS, [70, 10, 12, 8])[0],
                    hired_date=date(R.randint(max(TODAY.year - age + 19, 1995), TODAY.year), R.randint(1, 12), R.randint(1, 28)),
                    phone=phone()))
        db.bulk_insert_mappings(m.Worker, workers_rows)
        db.flush()
        kpi_rows = []
        cashiers = db.query(m.Worker).filter(m.Worker.position.in_(["Yuk xazinachisi", "Tovar kassiri"])).all()
        for w in cashiers:
            for mo in months:
                a, b, c = R.randint(60, 220), R.randint(40, 200), R.randint(20, 160)
                plan = R.randint(380, 620)
                pct = round(min(100, (a + b + c) / plan * 100), 0)
                kpi_rows.append(dict(worker_id=w.id, station_id=w.station_id, month=mo,
                                     docs={"GU-27": a, "GU-27e": b, "GU-45": c}, plan=plan, percent=pct,
                                     status=R.choices(["confirmed", "cancelled", "pending"], [55, 10, 35])[0]))
        db.bulk_insert_mappings(m.KpiRecord, kpi_rows)

    # ---------- Indicators (7 categories) ----------
    ind_rows = []
    base_cat = {1: 30, 2: 1800, 3: 25, 4: 58, 5: 3.2, 6: 45, 7: 28}
    for s in st_list:
        mult = 6 if s.is_hub else (1 if s.cargo_operations else 0.1)
        for y in (TODAY.year - 1, TODAY.year):
            for mo in range(1, 13):
                if y == TODAY.year and mo > TODAY.month:
                    continue
                for cat, b in base_cat.items():
                    v = b * (mult if cat not in (4, 5) else 1)
                    plan = round(v * R.uniform(.9, 1.15), 1)
                    ind_rows.append(dict(station_id=s.id, category=cat, year=y, month=mo, plan=plan,
                                         fact=round(plan * R.uniform(.78, 1.18), 1)))
    db.bulk_insert_mappings(m.IndicatorValue, ind_rows)

    # ---------- Traffic & finance daily ----------
    tr_rows, fin_rows = [], []
    for s in st_list:
        k = 5 if s.is_hub else (1 if s.cargo_operations else .25)
        for d in daterange(START, TODAY):
            ti, to = int(seasonal(d, 3 * k)), int(seasonal(d, 3 * k))
            tr_rows.append(dict(station_id=s.id, day=d, trains_in=ti, trains_out=to,
                                wagons_in=int(ti * R.uniform(35, 57)), wagons_out=int(to * R.uniform(35, 57)),
                                wagons_loaded=int(seasonal(d, 8 * k)), wagons_unloaded=int(seasonal(d, 7 * k))))
            if s.cargo_operations:
                ll, le = int(seasonal(d, 6 * k)), int(seasonal(d, 2 * k))
                ul, ui = int(seasonal(d, 5 * k)), int(seasonal(d, 1.5 * k))
                fin_rows.append(dict(
                    station_id=s.id, day=d, loaded_local=ll, loaded_export=le, unloaded_local=ul, unloaded_import=ui,
                    loaded_mass=round((ll + le) * R.uniform(52, 66), 1),
                    income={"podacha": round(seasonal(d, 2.4e6 * k)), "manyovr": round(seasonal(d, 1.1e6 * k)),
                            "promivka": round(seasonal(d, .4e6 * k)), "dopSbor": round(seasonal(d, .7e6 * k))},
                    fines={"emptyVagon": round(seasonal(d, .3e6 * k) * (R.random() > .6)),
                           "overload": round(seasonal(d, .5e6 * k) * (R.random() > .75)),
                           "notPlan": round(seasonal(d, .4e6 * k) * (R.random() > .8)),
                           "notCleaning": round(seasonal(d, .2e6 * k) * (R.random() > .7)),
                           "container": round(seasonal(d, .15e6 * k) * (R.random() > .85))},
                    road_fee={"local": round(ll * R.uniform(2.1e6, 3.4e6)), "export": round(le * R.uniform(4e6, 6e6)),
                              "import": round(ui * R.uniform(3.5e6, 5e6)), "smgs": round(le * R.uniform(.5e6, 1.2e6))}))
    db.bulk_insert_mappings(m.TrafficDaily, tr_rows)
    db.bulk_insert_mappings(m.FinanceDaily, fin_rows)
    print(f"traffic rows {len(tr_rows)}, finance rows {len(fin_rows)}")

    # ---------- Year metrics ----------
    ym = []
    for s in st_list:
        k = 5 if s.is_hub else 1
        for y in (TODAY.year - 1, TODAY.year):
            for metric, b in {"staff": 12, "income": 2.1e9, "loadedWagons": 2400, "expense": 1.6e9,
                              "unloadedWagons": 2100, "delivery": 3.2e8}.items():
                ly = round(b * k * R.uniform(.8, 1.2))
                plan = round(ly * R.uniform(1.0, 1.15))
                ym.append(dict(station_id=s.id, year=y, metric=metric, last_year=ly, plan=plan,
                               fact=round(plan * R.uniform(.75, 1.12))))
    db.bulk_insert_mappings(m.YearMetric, ym)

    # ---------- Fuel operations ----------
    fuel_rows = []
    for c in [c for c in companies if c.kind == "fuel"]:
        ops = ["loading", "unloading"] if c.fuel_mode == "both" else [c.fuel_mode]
        for d in daterange(START, TODAY):
            for op in ops:
                if R.random() < .35:
                    continue
                w = int(seasonal(d, 6))
                plan = int(w * R.uniform(.9, 1.3)) + 1
                fuel_rows.append(dict(company_id=c.id, station_id=c.station_id, day=d, op=op,
                                      scope=R.choices(["local", "export"], [78, 22])[0], product=R.choice(PRODUCTS_FUEL),
                                      wagons=w, tons=round(w * R.uniform(52, 64), 1), plan_wagons=plan,
                                      given_wagons=min(plan, w + R.randint(0, 3))))
    db.bulk_insert_mappings(m.FuelOperation, fuel_rows)

    # ---------- EMM ----------
    emm = []
    series = ["O'zbekiston", "3VL80s", "TEP70", "2TE10M", "UzTE16M"]
    for s in hubs:
        for _ in range(R.randint(10, 25)):
            dep = datetime.combine(TODAY, datetime.min.time()) - timedelta(hours=R.randint(1, 24 * 30))
            dst = R.choice(hubs)
            fs = round(R.uniform(3000, 6500))
            emm.append(dict(station_id=s.id, locomotive=f"{R.randint(1000, 9999)}", series=R.choice(series),
                            machinist=person("M")[0], route=f"{s.name} — {dst.name}", departed_at=dep,
                            arrived_at=dep + timedelta(hours=R.uniform(2, 14)) if R.random() > .1 else None,
                            fuel_start=fs, fuel_end=round(fs - R.uniform(400, 2200))))
    db.bulk_insert_mappings(m.EmmRoute, emm)

    # ---------- Train passes ----------
    tp = []
    for s in st_list:
        if not (s.is_hub or R.random() > .7):
            continue
        for _ in range(R.randint(20, 60)):
            nb = R.choice(hubs)
            tot = R.randint(30, 71)
            tp.append(dict(station_id=s.id, train_no=f"{R.randint(1001, 3999)}", direction=f"{s.name} → {nb.name}",
                           at=datetime.combine(TODAY, datetime.min.time()) - timedelta(minutes=R.randint(1, 60 * 24 * 14)),
                           wagons_total=tot, wagons_detected=tot - R.randint(0, 4)))
    db.bulk_insert_mappings(m.TrainPass, tp)

    # ---------- KMO ----------
    kmo = []
    roles = ["pd", "echk", "shn", "vchd", "pto", "passtrans", "dc", "vokzal"]
    for s in st_list:
        for mo in months:
            for _ in range(R.randint(0, 9 if s.is_hub else 3)):
                y, mm = map(int, mo.split("-"))
                kmo.append(dict(station_id=s.id, month=mo, role=R.choice(roles), kmo_type=R.choice(["kmo", "kkmo"]),
                                number=R.randint(1, 40),
                                status=R.choices(["done", "not_done", "repetition", "moved", "not_controlled"], [50, 20, 10, 10, 10])[0],
                                usage=R.choice(["open", "open", "closed"]), material_related=R.random() > .5,
                                rejected=R.random() > .85, description=R.choice(KMO_TEXT),
                                comment=R.choice([None, None, "Ta'mirlash rejalashtirildi", "Material kutilmoqda"]),
                                deadline=date(y, mm, 28), created_at=date(y, mm, R.randint(1, 20))))
    db.bulk_insert_mappings(m.KmoItem, kmo)

    # ---------- Access roads ----------
    ar = []
    for c in companies:
        if R.random() < .5:
            continue
        cd = date(R.randint(2016, TODAY.year - 1), R.randint(1, 12), R.randint(1, 28))
        t1 = round(R.uniform(80, 900))
        t2 = round(R.uniform(0, 600))
        ar.append(dict(station_id=c.station_id, owner=c.name, inn=c.inn, leader=c.leader,
                       email=f"info{c.id}@example.uz", phone=c.phone, distance_km=round(R.uniform(.3, 6), 1),
                       length_total=t1 + t2, length_t1=t1, length_t2=t2, contract_date=cd, contract_start=cd,
                       contract_end=cd.replace(year=cd.year + R.choice([3, 5, 10])),
                       contract_type=R.choice(["Ekspluatatsiya", "Xizmat ko'rsatish", "Ijaraga"]),
                       has_tech_passport=R.random() > .2, has_instruction=R.random() > .3,
                       junction=f"{R.randint(1, 40)}-strelka", load_hours=R.choice([2, 3, 4, 6]),
                       unload_hours=R.choice([2, 3, 4, 6]), oper2_hours=R.choice([.5, 1, 1.5]),
                       front=R.randint(4, 30), wagons_at_once=R.randint(2, 20), created_year=R.randint(1965, 2022),
                       canceled=R.random() > .9))
    db.bulk_insert_mappings(m.AccessRoad, ar)

    # ---------- Computers ----------
    comps = []
    for s in st_list:
        for _ in range(R.randint(3, 14) if s.is_hub else R.randint(0, 3)):
            comps.append(dict(station_id=s.id, company=f"{s.name} stansiyasi",
                              model=R.choice(["HP ProDesk 400 G7", "Lenovo ThinkCentre M70", "Dell OptiPlex 3090", "Acer Veriton"]),
                              monitor=R.choice(["HP P22", "Dell E2222H", "Lenovo T22i", "Samsung S24"]),
                              ups=R.choice(["APC 650VA", "Ippon Back 800", "Eaton 5E", "—"]),
                              printer=R.choice(["HP LaserJet M111", "Canon LBP6030", "Pantum P2500", "—"]),
                              inventory_no=f"INV-{R.randint(10000, 99999)}", radmin_id=f"{R.randint(100, 999)}.{R.randint(0, 255)}.{R.randint(0, 255)}",
                              anydesk_id=f"{R.randint(100, 999)} {R.randint(100, 999)} {R.randint(100, 999)}",
                              position_type=R.choice(POSITIONS), online=R.random() > .25,
                              entered_at=TODAY - timedelta(days=R.randint(10, 900))))
    db.bulk_insert_mappings(m.Computer, comps)

    # ---------- Cameras ----------
    groups = [m.CameraGroup(name=n) for n in ["Perronlar", "Yuk hovlilari", "Pereezdlar", "Tarozilar", "Depolar"]]
    db.add_all(groups)
    db.flush()
    demo_streams = [
        "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
    ]
    cams = []
    for s in hubs + R.sample(st_list, k=25):
        for i in range(R.randint(1, 4)):
            cams.append(dict(name=f"{s.name} — kamera {i + 1}", station_id=s.id, group_id=R.choice(groups).id,
                             lat=s.lat + R.uniform(-.01, .01), lng=s.lng + R.uniform(-.01, .01),
                             stream_url=R.choice(demo_streams), online=R.random() > .15,
                             vendor=R.choice(["Hikvision", "Dahua", "Uniview", "Axis"])))
    db.bulk_insert_mappings(m.Camera, cams)

    # ---------- Crossings (placed exactly on the track) ----------
    cr = []
    for ln in net_lines:
        total = ln["length"] / 1000
        n = int(total // 18)
        for i in range(n):
            la, lo, km = point_on_line(ln, (i + R.uniform(.3, .7)) / max(n, 1))
            cr.append(dict(name=f"Pereezd {ln['id']}-{i + 1}", station_id=nearest_station(la, lo).id, lat=la, lng=lo,
                           km=round(km, 1), is_protected=R.random() > .45))
    db.bulk_insert_mappings(m.Crossing, cr)

    # ---------- Warnings ----------
    warn_txt = ["Tezlik cheklovi 40 km/soat", "Yo'lda ta'mirlash ishlari", "Qor ko'chkisi xavfi",
                "Kuchli shamol ogohlantirishi", "Signal tizimida nosozlik"]
    long_lines = [ln for ln in net_lines if ln["length"] > 20000] or net_lines
    for _ in range(18):
        la, lo, _km = point_on_line(R.choice(long_lines), R.random())
        db.add(m.MapWarning(title=R.choice(warn_txt), level=R.choice(["low", "mid", "high"]), lat=la, lng=lo))

    # ---------- Track works ----------
    db.add_all([m.TrackWork(line=(wl := R.choice(long_lines))['id'], km_start=(k := R.randint(0, max(1, int(wl['length'] / 1000) - 10))), km_end=k + R.randint(1, 8),
                            picket_start=R.randint(1, 10), picket_end=R.randint(1, 10), repair_type=R.choice(REPAIR_TYPES),
                            created_by=admin.id) for _ in range(12)])

    # ---------- Scales + weighings ----------
    scale_st = hubs[:] + R.sample([s for s in st_list if s.cargo_operations and not s.is_hub], k=10)
    scales = [m.Scale(code=f"TRZ-{i + 1:03d}", station_id=s.id, kind=R.choice(["dynamic", "static"])) for i, s in enumerate(scale_st)]
    db.add_all(scales)
    db.flush()
    ww = []
    for sc in scales:
        for d in daterange(TODAY - timedelta(days=180), TODAY):
            for _ in range(R.randint(4, 18)):
                norm = R.choice([60, 66, 68, 69.5, 70, 71])
                cargo = round(norm * R.uniform(.82, 1.07), 2)
                extra = round(max(0, cargo - norm), 2)
                tare = round(R.uniform(22, 26), 2)
                ww.append(dict(scale_id=sc.id, station_id=sc.station_id,
                               wagon_number=f"{R.choice([5, 6, 7, 9])}{R.randint(1000000, 9999999)}",
                               weighed_at=datetime.combine(d, datetime.min.time()) + timedelta(minutes=R.randint(0, 1439)),
                               norm_ton=norm, scale_ton=round(cargo + tare, 2), cargo_ton=cargo, extra_ton=extra,
                               customs=R.choices([None, "import", "export"], [70, 15, 15])[0],
                               detected=R.random() > .04, confirmed=R.random() > .12))
    db.bulk_insert_mappings(m.WagonWeighing, ww)
    print(f"weighings {len(ww)}")

    # ---------- Park tracks + cadastre ----------
    pt = []
    parks = ["Saralash parki", "Jo'natish parki", "Qabul qilish parki"]
    purposes = ["Qabul-jo'natish", "Chiqarib qo'yuvchi", "Asosiy", "Tortuvchi", "Yuk ortish-tushirish", "Saralash"]
    cad = []
    for s in st_list:
        for p in (parks if s.is_hub else parks[:1]):
            for n in range(R.randint(3, 10) if s.is_hub else R.randint(1, 4)):
                L = R.randint(420, 1250)
                pt.append(dict(station_id=s.id, park=p, track_no=str(n + 1), purpose=R.choice(purposes),
                               arrow_from=str(R.randint(1, 40)), arrow_to=f"{R.randint(1, 120)}{R.choice(['', 'r'])}",
                               length_total=L, usable_length=L - R.randint(40, 180), wagon_capacity=int(L / 14.5),
                               insulation=R.choice(["Bor", "Yo'q", "Qisman"]), contact_network=R.random() > .4,
                               alns=R.random() > .5))
        area = round(R.uniform(800, 90000) if s.is_hub else R.uniform(150, 4000), 2)
        blds = [dict(name=R.choice(["Stansiya binosi", "Ombor", "Texnik xona", "Post EC", "Vokzal", "Garaj"]),
                     cadastre_no=f"{R.randint(10, 14)}:{R.randint(1, 20):02d}:{R.randint(1, 99):02d}:{R.randint(1, 9):02d}:{R.randint(100, 999)}",
                     floors=R.randint(1, 3), footprint=round(R.uniform(40, 900), 1),
                     total=round(R.uniform(60, 1600), 1), usable=round(R.uniform(40, 1300), 1))
                for _ in range(R.randint(1, 5))]
        cad.append(dict(station_id=s.id, compiled_at=date(R.randint(2019, TODAY.year), R.randint(1, 12), R.randint(1, 28)),
                        passport_no=f"KP-{R.randint(100000, 999999)}",
                        parcel_no=f"{R.randint(10, 14)}:{R.randint(1, 20):02d}:{R.randint(1, 99):02d}:{R.randint(1, 9):02d}:{R.randint(1000, 9999)}",
                        location=f"{db.get(m.Mtu, s.mtu_id).short} hududi, {s.name}", object_name=R.choice(["Noturar yer maydoni", "Temir yo'l mulki"]),
                        category=R.choice(["noturar", "sanoat, transport, aloqa"]), subcategory=R.choice([None, "temir yo'l transporti"]),
                        use_type=R.choice(["doimiy", "ijaraga"]), land_area=area, servitude=R.choice([None, "Mavjud emas", "Elektr uzatish liniyasi"]),
                        m2_total=area, m2_legal=round(area * R.uniform(.7, 1), 2), m2_in_use=round(area * R.uniform(.4, .9), 2),
                        buildings=blds))
    if os.getenv("SEED_DEMO_STAFF") == "1":  # real tracks come from Excel import / station_records.json
        db.bulk_insert_mappings(m.ParkTrack, pt)
    db.bulk_insert_mappings(m.Cadastre, cad)

    db.commit()

    # re-apply admin map edits (renamed / moved stations, custom markers) — see map_routes.EDITS_FILE
    import json
    edits_path = os.path.join(os.getenv("DATA_DIR", "data"), "map_edits.json")
    if os.path.exists(edits_path):
        with open(edits_path, encoding="utf-8") as f:
            edits = json.load(f)
        for esr, e in edits.get("stations", {}).items():
            s = db.query(m.Station).filter(m.Station.esr_code == esr).first()
            if s:
                s.name, s.esr_code, s.lat, s.lng = e["name"], e.get("esr") or esr, e["lat"], e["lng"]
        for esr in edits.get("deletedStations", []):
            s = db.query(m.Station).filter(m.Station.esr_code == esr).first()
            if s:
                for model in (m.Worker, m.KpiRecord, m.IndicatorValue, m.TrafficDaily, m.TrainPass, m.EmmRoute, m.KmoItem,
                              m.FinanceDaily, m.YearMetric, m.FuelOperation, m.AccessRoad, m.Computer, m.Camera, m.Crossing,
                              m.ParkTrack, m.Cadastre, m.WagonWeighing, m.Scale, m.Company, m.StationMedia):
                    db.query(model).filter(model.station_id == s.id).delete(synchronize_session=False)
                db.delete(s)
        for esr, info in edits.get("stationInfo", {}).items():
            s = db.query(m.Station).filter(m.Station.esr_code == (edits.get("stations", {}).get(esr, {}).get("esr") or esr)).first()
            if s:
                for col, v in info.items():
                    if hasattr(s, col):
                        setattr(s, col, v)
        for esr, items in edits.get("media", {}).items():
            s = db.query(m.Station).filter(m.Station.esr_code == (edits.get("stations", {}).get(esr, {}).get("esr") or esr)).first()
            if s:
                db.add_all([m.StationMedia(station_id=s.id, kind=x["kind"], url=x["url"], title=x.get("title")) for x in items])
        for mk in edits.get("markers", []):
            db.add(m.MapMarker(**{k: mk.get(k) for k in ("name", "kind", "color", "note", "lat", "lng")}))
        db.commit()
        print(f"map edits: {len(edits.get('stations', {}))} stations, {len(edits.get('markers', []))} markers")

    # official MTU station lists: names as on the scheme, explicit MTU membership, stations missing from OSM
    from . import sync_mtu
    changed = sync_mtu.sync(db)
    db.commit()
    print(f"MTU registry: {sum(1 for r in changed if r['action'] != 'same')} stations updated")

    # staff and park tracks entered by admins (data/station_records.json)
    from . import records
    restored = records.restore(db)
    db.commit()
    if restored:
        print(f"station records restored: {restored} stations")

    # save line geometry for the map
    feats = [{"type": "Feature",
              "properties": {"id": ln["id"], "title": ln["title"], "electrified": ln["electrified"], "optic": ln["optic"],
                             "usage": ln["usage"], "lengthKm": round(ln["length"] / 1000, 1)},
              "geometry": {"type": "LineString", "coordinates": [[p[1], p[0]] for p in ln["path"]]}} for ln in net_lines]
    colors = {code: mt.color for code, mt in mtu_by_code.items()}
    mfeats = [{"type": "Feature",
               "properties": {"id": ln["id"], "title": ln["title"], "electrified": ln["electrified"], "optic": ln["optic"],
                              "mtuId": mtu_by_code[code].id, "color": colors[code]},
               "geometry": {"type": "LineString", "coordinates": [[p[1], p[0]] for p in seg]}} for ln, code, seg in mtu_features]
    os.makedirs("data", exist_ok=True)
    with open("data/lines.geojson", "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": feats}, f, ensure_ascii=False)
    with open("data/lines_mtu.geojson", "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": mfeats}, f, ensure_ascii=False)
    db.close()
    print("Seed complete.")


if __name__ == "__main__":
    run()
