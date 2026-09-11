"""
Database setup.

Defaults to a local SQLite file (portfolio.db) so everything runs with zero
external setup on your machine. Set DATABASE_URL to a Postgres connection
string — Supabase, Render, Neon, anything — and the whole app moves over
without a code change; SQLAlchemy handles both dialects the same way.

Two things about hosted Postgres that bite if they aren't handled here:

  * The URL scheme. Supabase and Heroku hand out `postgres://...`, which
    SQLAlchemy has not accepted since 1.4 — it wants `postgresql://`, and it
    needs to know which driver to use. Both are normalised below, so you can
    paste the connection string exactly as the dashboard gives it to you.

  * Dropped connections. A pooled or serverless Postgres closes idle
    connections behind SQLAlchemy's back, and the next request then fails on
    a dead socket. `pool_pre_ping` checks each connection before handing it
    out, which turns that crash into a silent reconnect.
"""
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

RAW_URL = os.environ.get("DATABASE_URL", "sqlite:///./portfolio.db").strip()


def _normalise(url: str) -> str:
    """Accepts the connection string as a dashboard gives it and returns one
    SQLAlchemy will actually open."""
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        # Name the driver explicitly rather than relying on the default,
        # which differs between SQLAlchemy versions and installed packages.
        url = "postgresql+psycopg2://" + url[len("postgresql://"):]
    return url


DATABASE_URL = _normalise(RAW_URL)
IS_SQLITE = DATABASE_URL.startswith("sqlite")

if IS_SQLITE:
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,   # survive a connection the pooler closed on us
        pool_recycle=280,     # and recycle before a typical 300s idle timeout
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
