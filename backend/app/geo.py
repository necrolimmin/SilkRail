"""Reference geography for SilkRail seed data.

Coordinates are approximate public city/station locations; intermediate
stops are generated synthetically along each line.
"""

MTUS = [
    # code, name, short, color, lat, lng
    ("MTU-1", "Toshkent mintaqaviy temir yo'l uzeli", "Toshkent", "#0EA5A4", 41.10, 69.30),
    ("MTU-2", "Qo'qon mintaqaviy temir yo'l uzeli", "Qo'qon", "#6366F1", 40.70, 71.60),
    ("MTU-3", "Buxoro mintaqaviy temir yo'l uzeli", "Buxoro", "#F59E0B", 39.80, 65.00),
    ("MTU-4", "Qo'ng'irot mintaqaviy temir yo'l uzeli", "Qo'ng'irot", "#EC4899", 42.60, 59.50),
    ("MTU-5", "Qarshi mintaqaviy temir yo'l uzeli", "Qarshi", "#22C55E", 38.80, 66.00),
    ("MTU-6", "Termiz mintaqaviy temir yo'l uzeli", "Termiz", "#EF4444", 37.70, 67.50),
]

# Lines: (line_id, title, electrified, optic, [(station, lat, lng, mtu_code, is_hub), ...])
LINES = [
    ("L1", "Toshkent — Samarqand — Buxoro — Olot", True, True, [
        ("Toshkent", 41.2917, 69.2865, "MTU-1", True),
        ("Chinoz", 40.9406, 68.7700, "MTU-1", False),
        ("Sirdaryo", 40.8440, 68.6610, "MTU-1", False),
        ("Guliston", 40.4897, 68.7842, "MTU-1", False),
        ("Xovos", 40.2200, 68.8400, "MTU-1", True),
        ("Jizzax", 40.1158, 67.8422, "MTU-1", False),
        ("Samarqand", 39.6700, 66.9300, "MTU-3", True),
        ("Kattaqo'rg'on", 39.9000, 66.2600, "MTU-3", False),
        ("Navoiy", 40.1000, 65.3700, "MTU-3", True),
        ("Kogon", 39.7200, 64.5500, "MTU-3", True),
        ("Qorako'l", 39.5000, 63.8500, "MTU-3", False),
        ("Olot", 39.4200, 63.8000, "MTU-3", False),
    ]),
    ("L2", "Toshkent — Angren — Pop — Andijon", True, True, [
        ("Toshkent", 41.2917, 69.2865, "MTU-1", True),
        ("Ohangaron", 40.9060, 69.6380, "MTU-1", False),
        ("Angren", 41.0100, 70.1400, "MTU-1", True),
        ("Qamchiq", 41.0500, 70.6000, "MTU-2", False),
        ("Pop", 40.8700, 71.1000, "MTU-2", True),
        ("Chust", 41.0000, 71.2400, "MTU-2", False),
        ("Namangan", 41.0000, 71.6700, "MTU-2", True),
        ("Uchqo'rg'on", 41.1100, 72.0800, "MTU-2", False),
        ("Andijon", 40.7800, 72.3400, "MTU-2", True),
    ]),
    ("L3", "Xovos — Qo'qon — Farg'ona — Andijon", True, False, [
        ("Xovos", 40.2200, 68.8400, "MTU-1", True),
        ("Bekobod", 40.2200, 69.2700, "MTU-1", False),
        ("Qo'qon", 40.5300, 70.9400, "MTU-2", True),
        ("Marg'ilon", 40.4700, 71.7200, "MTU-2", False),
        ("Farg'ona", 40.3800, 71.7800, "MTU-2", True),
        ("Asaka", 40.6400, 72.2400, "MTU-2", False),
        ("Andijon", 40.7800, 72.3400, "MTU-2", True),
    ]),
    ("L4", "Navoiy — Uchquduq — Miskin — Nukus", False, True, [
        ("Navoiy", 40.1000, 65.3700, "MTU-3", True),
        ("Zarafshon", 41.5700, 64.2000, "MTU-3", False),
        ("Uchquduq", 42.1600, 63.5500, "MTU-3", True),
        ("Miskin", 42.0000, 61.9000, "MTU-4", False),
        ("Beruniy", 41.6900, 60.7500, "MTU-4", False),
        ("Nukus", 42.4600, 59.6000, "MTU-4", True),
    ]),
    ("L5", "Buxoro — To'rtko'l — Urganch — Xiva", False, False, [
        ("Kogon", 39.7200, 64.5500, "MTU-3", True),
        ("Buxoro", 39.7700, 64.4200, "MTU-3", False),
        ("Jonboy", 40.4500, 62.9000, "MTU-3", False),
        ("To'rtko'l", 41.5500, 61.0000, "MTU-4", False),
        ("Urganch", 41.5500, 60.6300, "MTU-4", True),
        ("Xiva", 41.3800, 60.3600, "MTU-4", False),
    ]),
    ("L6", "Nukus — Qo'ng'irot — Jasliq — Qoraqalpog'iston", False, True, [
        ("Nukus", 42.4600, 59.6000, "MTU-4", True),
        ("Xo'jayli", 42.4000, 59.4500, "MTU-4", False),
        ("Qo'ng'irot", 43.0500, 58.8400, "MTU-4", True),
        ("Qoraqalpog'iston", 43.4500, 58.2500, "MTU-4", False),
        ("Jasliq", 43.9700, 57.4700, "MTU-4", False),
        ("Oazis", 44.6500, 56.4000, "MTU-4", True),
    ]),
    ("L7", "Kogon — Qarshi — G'uzor — Termiz", True, True, [
        ("Kogon", 39.7200, 64.5500, "MTU-3", True),
        ("Muborak", 39.2500, 65.1500, "MTU-5", False),
        ("Qarshi", 38.8600, 65.7900, "MTU-5", True),
        ("G'uzor", 38.6200, 66.2500, "MTU-5", False),
        ("Boysun", 38.2000, 67.2000, "MTU-6", False),
        ("Sho'rchi", 38.0000, 67.7900, "MTU-6", False),
        ("Qumqo'rg'on", 37.8300, 67.5800, "MTU-6", False),
        ("Jarqo'rg'on", 37.5000, 67.4200, "MTU-6", False),
        ("Termiz", 37.2242, 67.2783, "MTU-6", True),
        ("Hayraton", 37.2100, 67.4200, "MTU-6", False),
    ]),
    ("L8", "Qarshi — Kitob — Samarqand", False, False, [
        ("Qarshi", 38.8600, 65.7900, "MTU-5", True),
        ("Tolimarjon", 38.4000, 65.6200, "MTU-5", False),
        ("Kitob", 39.1200, 66.8800, "MTU-5", False),
        ("Shahrisabz", 39.0600, 66.8300, "MTU-5", False),
        ("Samarqand", 39.6700, 66.9300, "MTU-3", True),
    ]),
    ("L9", "Sho'rchi — Denov — Sariosiyo", True, False, [
        ("Sho'rchi", 38.0000, 67.7900, "MTU-6", False),
        ("Denov", 38.2700, 67.9000, "MTU-6", False),
        ("Sariosiyo", 38.4100, 67.9600, "MTU-6", False),
    ]),
]

# Generic names for synthetic intermediate stops
INTERMEDIATE_PREFIX = ["Raz'ezd", "Blok-post", "Bekat", "Ayrilish"]
