from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool

from app.config import settings


class Base(DeclarativeBase):
    pass


def _ensure_sqlite_parent_dir(url: str) -> None:
    if not url.startswith("sqlite"):
        return
    rest = url.removeprefix("sqlite:///")
    if rest.startswith("//"):
        return
    path = Path(rest)
    if path.parent != Path("."):
        path.parent.mkdir(parents=True, exist_ok=True)


_ensure_sqlite_parent_dir(settings.database_url)

connect_args: dict = {}
engine_kwargs: dict = {"echo": False}
if settings.database_url.startswith("sqlite"):
    # NullPool: each session opens/closes its own connection. Required for
    # CELERY_EAGER + threaded match pipeline — QueuePool exhausts quickly and
    # surfaces as TimeoutError / Internal Server Error on by-steam.
    connect_args = {"check_same_thread": False, "timeout": 60}
    engine_kwargs["poolclass"] = NullPool

engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    **engine_kwargs,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@event.listens_for(engine, "connect")
def _sqlite_wal_on_connect(dbapi_connection, _connection_record) -> None:
    """Allow concurrent writers from the match pipeline thread pool without serializing on one DB lock."""
    if settings.database_url.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


def ensure_sqlite_schema_compat() -> None:
    """Lightweight migrations for existing SQLite files (create_all does not add new columns)."""
    if not settings.database_url.startswith("sqlite"):
        return
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    table_names = set(insp.get_table_names())
    if "faceit_matches" in table_names:
        cols = {c["name"] for c in insp.get_columns("faceit_matches")}
        if "analytics" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE faceit_matches ADD COLUMN analytics TEXT"))
            cols.add("analytics")
        if "match_meta" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE faceit_matches ADD COLUMN match_meta TEXT"))
            cols.add("match_meta")
    if "linked_players" in table_names:
        cols = {c["name"] for c in insp.get_columns("linked_players")}
        if "steam_id" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE linked_players ADD COLUMN steam_id VARCHAR(32)"))
                conn.execute(
                    text("CREATE INDEX IF NOT EXISTS ix_linked_players_steam_id ON linked_players (steam_id)")
                )
            cols.add("steam_id")
        if "demos_archive_enqueued_at" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE linked_players ADD COLUMN demos_archive_enqueued_at DATETIME"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
