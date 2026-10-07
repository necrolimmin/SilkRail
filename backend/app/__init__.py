"""SilkRail backend package. Loads backend/.env (if present) before any module reads its settings."""
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:  # python-dotenv not installed: rely on real environment variables
    pass
