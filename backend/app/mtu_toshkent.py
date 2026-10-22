"""Reference list of the Toshkent MTU stations, from the official scheme
"Toshkent mintaqaviy temir yo'l uzeli filiali temir yo'llari sxemasi".

Each entry: (name on the scheme, section, km post on the scheme, key).
The key is the ESR code the station comes with from our source data (OSM), or a made-up one for a station we did not
have. Where the real ESR code differs from the key, CODES gives it.
`app.sync_mtu` applies it to the database: renames stations to the scheme spelling, ties them to the Toshkent MTU
explicitly (instead of "by coordinates") and adds the missing ones.

For stations that are new to us, NEW_PLACEMENT tells where to put them: a point between / beyond two known stations,
proportional to the km posts, along the track. They can be dragged on the map afterwards.
"""

MTU_CODE = "MTU-1"  # geo.MTUS code of the Toshkent node

# sections as on the scheme legend
UZEL, TEZ, XOVOS, ANGREN, XOJAKENT, UCHQULOQ = "uzel", "tezyurar", "xovos", "angren", "xojakent", "uchquloq"

STATIONS = [
    # --- Toshkent node and the main line towards Sirdaryo ---
    ("Oqko'prik", UZEL, "3346", "799001"),
    ("Keles", UZEL, "3349+776", "720104"),
    ("Chuqursoy", UZEL, "3354+968", "720000"),
    ("Nazarbek", UZEL, "3363", "722203"),
    ("Dalaguzar", UZEL, "3375+588", "722307"),
    ("Salor", UZEL, "3363+579", "720903"),
    ("Toshkent Shimoliy", TEZ, "3367+101", "720918"),
    ("Toshkent", UZEL, "12 km PK7", "722400"),
    ("Hamza", UZEL, "5+054", "722504"),
    ("To'qimachi", TEZ, "3372+162", "723600"),
    ("Toshkent Janubiy", TEZ, "3374+195", "723615"),
    ("Sobir Rahimov", TEZ, "3376+026", "723704"),
    ("O'rta-oul", TEZ, "3384+853", "723808"),
    ("O'zbekiston", TEZ, "3388+309", "723827"),
    ("Yangiyo'l", TEZ, "3395+571", "724001"),
    ("Paxta", TEZ, "3410+528", "724209"),
    ("Olmazor", TEZ, "3419+912", "790414"),
    ("Chinoz", TEZ, "3429+279", "724406"),
    ("Yangi Chinoz", TEZ, "3435+416", "724502"),
    # --- Angren line ---
    ("Sergili", ANGREN, "7+425", "723507"),
    ("Jaloyir", ANGREN, "10+612", "723403"),
    ("Kuchlik", ANGREN, "29+329", "723307"),
    ("To'ytepa", ANGREN, "41+000", "723206"),
    ("Ozodlik", ANGREN, "56+125", "723102"),
    ("Oxangaron", ANGREN, "68+628", "723009"),
    ("Aqcha", ANGREN, "86+800", "72280"),
    ("Oblik", ANGREN, "103+354", "722701"),
    ("Angren", ANGREN, "113+974", "722608"),
    # --- Xo'jakent line ---
    ("Nurhayot", XOJAKENT, "8+725", "721107"),
    ("Qodiriya", XOJAKENT, "12+412", "721200"),
    ("Baytqo'rg'on", XOJAKENT, "21+622", "721304"),
    ("Parkent", XOJAKENT, "24 km PK5", "723702"),
    ("Bo'zsuv", XOJAKENT, "27+412", "721408"),
    ("Chirchiq", XOJAKENT, "31+694", "721501"),
    ("Aranchi", XOJAKENT, "38+856", "721605"),
    ("Barraj", XOJAKENT, "46+900", "721802"),
    ("Xo'jakent", XOJAKENT, "64+611", "722006"),
    ("Chinorkent", XOJAKENT, "65+765", "723476"),
    # --- Sirdaryo region ---
    ("Sirdaryo", TEZ, "3447+765", "724707"),
    ("Baxt", TEZ, "3461+215", "724800"),
    ("Oqoltin", TEZ, "3473+327", "724904"),
    ("Guliston", TEZ, "3485+880", "725004"),
    ("Boyovut", TEZ, "3492+050", "725108"),
    ("Yangiyer 2", TEZ, "3501+150", "725409"),
    ("Yangiyer", XOVOS, "3508+676", "725201"),
    ("Xovos", XOVOS, "3519+450", "725803"),
    ("Farhod", XOVOS, "20+260", "726007"),
    ("Bekobod", XOVOS, "33+546", "726100"),
    # --- Jizzax region ---
    ("Rabot", XOVOS, "14+731", "726505"),
    ("Zomin turizm", TEZ, "3549+500", "726609"),   # was "Dashtobod": 30.0 km from Xovos by coordinates, 30.05 by km posts
    ("Zomin", TEZ, "3565+433", "720259"),          # was "No 6": 45.6 km vs 45.98
    ("Zarbdor", TEZ, "3580+579", "726702"),
    ("Sayxun", TEZ, "3591+535", "726806"),         # was "No 9": 69 km vs 72; its OSM code is really Boytog' (see CODES)
    ("Jizzax park A", TEZ, "3608+782", "726903"),  # was "Jizzax" (main line)
    ("Jizzax park B", UCHQULOQ, "3554+760", "720277"),  # was "Jizzax 2" (on the branch to Chamanzor)
    ("Chamanzor", UCHQULOQ, "3539+853", "726308"),
    ("Paxtakor", UCHQULOQ, "3537+784", "725708"),
    ("Do'stlik", UCHQULOQ, "3507+712", "725606"),
    ("Erjar", UCHQULOQ, "3487+727", "725502"),
    ("Boytog'", UCHQULOQ, "20+998", "799002"),
    ("Chimqo'rg'on", UCHQULOQ, "40+894", "799003"),
    ("Uchquloch", UCHQULOQ, "70+717", "723454"),
]

# key -> real ESR code, where they differ
CODES = {
    "726806": "799004",  # Sayxun: the source data gave it Boytog' code; its own code is not known yet
    "799002": "726806",  # Boytog'
    "799003": "726401",  # Chimqo'rg'on
}

# Codes made up by us (real one not known yet): Oqko'prik, Sayxun
PROVISIONAL = {"799001", "799004"}

# Where to put the stations we did not have: (from ESR, to ESR, fraction of the way from -> to; >1 or <0 extrapolates)
NEW_PLACEMENT = {
    # 3.8 km beyond Keles on the line from Chuqursoy (5.2 km before it) towards the border
    "Oqko'prik": ("720000", "720104", 1.73),
    # on the Chamanzor -> Uchquloch branch, 70.7 km long
    "Boytog'": ("726308", "723454", 20.998 / 70.717),
    "Chimqo'rg'on": ("726308", "723454", 40.894 / 70.717),
}
