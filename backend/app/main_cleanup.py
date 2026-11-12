"""Clean-ups of demo data that older databases still carry (run by app.main on start)."""
from sqlalchemy import text

# public test videos the seed used for made-up cameras; a camera playing one of them is not a real camera
DEMO_STREAMS = (
    "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
)


def remove_demo_cameras(conn) -> int:
    """Deletes the made-up cameras (real cameras come from Argus). Kept when SEED_DEMO_STAFF=1 asks for demo data."""
    import os
    if os.getenv("SEED_DEMO_STAFF") == "1":
        return 0
    q = text("DELETE FROM cameras WHERE stream_url IN (:a, :b)")
    return conn.execute(q, {"a": DEMO_STREAMS[0], "b": DEMO_STREAMS[1]}).rowcount or 0
