from datetime import date, timedelta
from fastapi import HTTPException


def parse_range(start: str | None, end: str | None, mode: str = "days") -> tuple[date, date]:
    today = date.today()
    s = date.fromisoformat(start) if start else today.replace(day=1)
    e = date.fromisoformat(end) if end else today
    if e < s:
        raise HTTPException(400, "range")
    if mode == "days" and (s.year, s.month) != (e.year, e.month):
        # same rule as the reference product: daily mode must stay inside one month
        raise HTTPException(422, "range_one_month")
    return s, e


def bucket_expr(mode: str, col):
    """Date bucket as text; works on SQLite and PostgreSQL."""
    from sqlalchemy import func
    from ..db import engine
    pg = engine.dialect.name == "postgresql"
    fmt = {"months": ("%Y-%m", "YYYY-MM"), "years": ("%Y", "YYYY")}.get(mode, ("%Y-%m-%d", "YYYY-MM-DD"))
    return func.to_char(col, fmt[1]) if pg else func.strftime(fmt[0], col)


def month_add(d: date, n: int) -> date:
    y, mo = divmod(d.month - 1 + n, 12)
    return date(d.year + y, mo + 1, 1)


def page(q, page_: int, size: int):
    total = q.count()
    return total, q.offset((page_ - 1) * size).limit(size).all()
