"""MongoDB connection and session factory."""
from typing import Generator, Optional

from bson.codec_options import CodecOptions
from datetime import timezone
from pymongo import MongoClient
from pymongo.database import Database

from app.core.config import settings
from app.core.odm import Base, Session  # noqa: F401  (re-exported)

_client: Optional[MongoClient] = None


def get_client() -> MongoClient:
    """Process-wide client, created lazily (safe for serverless cold starts)."""
    global _client
    if _client is None:
        _client = MongoClient(
            settings.MONGODB_URI,
            tz_aware=True,
            tzinfo=timezone.utc,
            serverSelectionTimeoutMS=10000,
            appname="site-leaderboard-weekly-insights",
        )
    return _client


def get_database() -> Database:
    return get_client().get_database(
        settings.MONGODB_DB_NAME,
        codec_options=CodecOptions(tz_aware=True, tzinfo=timezone.utc),
    )


def SessionLocal() -> Session:
    return Session(get_database())


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
