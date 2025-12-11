from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import StaticPool
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./mindmap.db")

# For SQLite, we need special settings for async compatibility and Azure Files
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={
            "check_same_thread": False,
            "timeout": 30,  # Wait up to 30 seconds for locks
        },
        poolclass=StaticPool,
    )

    # Configure SQLite for better concurrency on network filesystems
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        # Use WAL mode for better concurrency (if supported)
        try:
            cursor.execute("PRAGMA journal_mode=WAL")
        except Exception:
            # Fall back to DELETE mode if WAL isn't supported
            cursor.execute("PRAGMA journal_mode=DELETE")
        # Increase busy timeout to 30 seconds
        cursor.execute("PRAGMA busy_timeout=30000")
        # Use NORMAL synchronous mode for better performance
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()
else:
    engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
