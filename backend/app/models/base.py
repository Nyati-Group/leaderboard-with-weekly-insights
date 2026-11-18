from datetime import datetime, timezone
from app.core.odm import Column, DateTime, GUID

__all__ = ["GUID", "TimestampMixin", "get_utc_now"]


def get_utc_now():
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now, nullable=False)
