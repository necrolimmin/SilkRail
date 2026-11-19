"""Clean-ups of demo data that older databases still carry (run by app.main on start)."""
from sqlalchemy import text

# public test videos the seed used for made-up cameras; a camera playing one of them is not a real camera
DEMO_STREAMS = (
    "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
)


def reset_demo_inactive(conn) -> int:
    """The seed used to switch ~8% of the stations off at random. Now a switched-off station disappears for users,
    so once: every station on again, except those an admin switched off (stationInfo in data/map_edits.json)."""
    import json
    import os
    if conn.execute(text("SELECT 1 FROM settings WHERE key = 'demo_inactive_reset'")).first():
        return 0
    off = set()
    try:
        with open(os.path.join(os.getenv("DATA_DIR", "data"), "map_edits.json"), encoding="utf-8") as f:
            edits = json.load(f)
        for k, v in edits.get("stationInfo", {}).items():
            if v.get("is_active") is False:
                off.add(v.get("esr_code") or k)
    except (OSError, ValueError):
        pass
    rows = conn.execute(text("SELECT id, esr_code FROM stations WHERE NOT is_active")).all()
    ids = [r[0] for r in rows if r[1] not in off]
    for i in ids:
        conn.execute(text("UPDATE stations SET is_active = :t WHERE id = :i"), {"t": True, "i": i})
    conn.execute(text("INSERT INTO settings (key, value) VALUES ('demo_inactive_reset', CAST(:v AS JSON))"), {"v": "true"})
    return len(ids)


def remove_demo_cameras(conn) -> int:
    """Deletes the made-up cameras (real cameras come from Argus). Kept when SEED_DEMO_STAFF=1 asks for demo data."""
    import os
    if os.getenv("SEED_DEMO_STAFF") == "1":
        return 0
    q = text("DELETE FROM cameras WHERE stream_url IN (:a, :b)")
    return conn.execute(q, {"a": DEMO_STREAMS[0], "b": DEMO_STREAMS[1]}).rowcount or 0
