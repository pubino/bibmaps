from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import StaticPool
import os
import logging

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./mindmap.db")

# Determine database type
is_sqlite = DATABASE_URL.startswith("sqlite")
is_mssql = DATABASE_URL.startswith("mssql") or "sqlserver" in DATABASE_URL.lower()

# Configure engine based on database type
if is_sqlite:
    # For SQLite, we need special settings for async compatibility and Azure Files
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

elif is_mssql:
    # Azure SQL / SQL Server configuration
    # Connection string format: mssql+pyodbc://user:password@server/database?driver=ODBC+Driver+18+for+SQL+Server
    engine = create_engine(
        DATABASE_URL,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,  # Verify connections before use
        pool_recycle=300,  # Recycle connections after 5 minutes
    )
    logger.info("Configured Azure SQL database connection")

else:
    # Generic database (PostgreSQL, MySQL, etc.)
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
    """Initialize the database by creating all tables."""
    Base.metadata.create_all(bind=engine)
    logger.info(f"Database initialized (type: {'SQLite' if is_sqlite else 'Azure SQL' if is_mssql else 'Other'})")


def drop_db():
    """Drop all tables from the database. Use with caution!"""
    Base.metadata.drop_all(bind=engine)
    logger.info("All database tables dropped")


def get_database_type() -> str:
    """Return the type of database being used."""
    if is_sqlite:
        return "sqlite"
    elif is_mssql:
        return "mssql"
    else:
        return "other"
