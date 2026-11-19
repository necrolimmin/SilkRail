"""Corrections to the map's tracks and km count that are part of the project (unlike data/km_edits.json, which holds what
admins change on the map and is not in git).

Xovos junction, by the MTU scheme:
  * the main line (35xx) runs Yangiyer 2 — Yangiyer — Xovos — Dashtobod (Zomin turizm) — Jizzax;
  * the high-speed chord leaves it at the block post north of Yangiyer, is counted from 0 there, passes Rabot (14+731)
    and joins the main line again at Dashtobod;
  * the Bekobod line is counted from 0 at Xovos station (Farhod 20+260, Bekobod 33+546).
"""

# Tracks missing from data/lines.geojson (it is built from OpenStreetMap, which does not have them).
# Xovos — Dashtobod is drawn straight: 28.1 km on the map against 27.99 km by the scheme.
EXTRA_LINES = [
    {"type": "Feature",
     "properties": {"id": "R900", "title": "Xovos — Dashtobod", "electrified": True, "optic": True, "usage": "main", "lengthKm": 28.1},
     "geometry": {"type": "LineString", "coordinates": [[68.81191, 40.21278], [68.498335, 40.133229]]}},
]
EXTRA_LIKE = {"R900": "R90"}  # in the per-MTU colouring the extra line looks like this neighbour

# (lat, lng, lat, lng): no km posts between these two points on a line that passes both. The connecting curve from
# Yangiyer to the chord is neither the main line nor the chord; without this the main line's km would run on along it.
NO_KM = [
    (40.3045, 68.8216, 40.3060, 68.7995),
]

# (km, lat, lng): points of the track whose km is known. They work like the km set by hand on the map
# (an admin's own mark with the same km nearby replaces the point here).
ANCHORS = [
    (3505.698, 40.3264816, 68.8161471),  # north junction (block post): the chord leaves the main line
    (1.5, 40.313611, 68.812533),         # chord, 1.5 km from that junction (its km 0)
    (33.611, 40.142171, 68.523996),      # chord, 2.4 km before it joins the main line at Zomin turizm
    (3516.583, 40.22744, 68.84598),      # Yangiyer — Xovos: the triangle north of Xovos
    (3518.009, 40.21497, 68.84928),      # Xovos, north throat
    (3518.803, 40.20997, 68.84348),      # the line from Yangiyer joins the station tracks
    (3521.506, 40.21278, 68.81191),      # west end of Xovos: the line to Dashtobod starts
    (0.944, 40.209565, 68.846987),       # Bekobod line, counted from Xovos station
    (2.275, 40.21066, 68.86255),         # Bekobod line: the tracks of Xovos end
]
