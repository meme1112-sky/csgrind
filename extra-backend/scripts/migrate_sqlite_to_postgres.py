"""
One-shot: copy SQLite demo DB rows into PostgreSQL.

Usage (from extra-backend/, services stopped recommended):

  ./.venv/bin/python scripts/migrate_sqlite_to_postgres.py \\
    --sqlite ./data/csgrind_demos.db \\
    --postgres 'postgresql+psycopg2://csgrind:PASSWORD@127.0.0.1:5432/csgrind_demos'

Creates Postgres tables if missing, then copies row-by-row. Safe to re-run only on an
empty target (script refuses if target tables already have rows unless --force).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Allow `python scripts/...` from extra-backend/
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.db import Base
from app.models import FaceitMatchRecord, LinkedPlayer, ValveMatchRecord, ValveMmLink

TABLE_MODELS = (
    LinkedPlayer,
    FaceitMatchRecord,
    ValveMmLink,
    ValveMatchRecord,
)


def _count(session: Session, model) -> int:
    return int(session.scalar(select(func.count()).select_from(model)) or 0)


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate CSGrind SQLite → PostgreSQL")
    parser.add_argument("--sqlite", required=True, help="Path to csgrind_demos.db")
    parser.add_argument("--postgres", required=True, help="SQLAlchemy Postgres URL")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Copy even if Postgres tables already have rows (may create PK conflicts)",
    )
    args = parser.parse_args()

    sqlite_path = Path(args.sqlite).resolve()
    if not sqlite_path.is_file():
        print(f"SQLite file not found: {sqlite_path}", file=sys.stderr)
        return 1

    sqlite_url = f"sqlite:///{sqlite_path}"
    src_engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})
    dst_engine = create_engine(args.postgres)

    # Ensure models are registered, then create empty Postgres schema.
    Base.metadata.create_all(bind=dst_engine)

    with Session(src_engine) as src, Session(dst_engine) as dst:
        if not args.force:
            for model in TABLE_MODELS:
                n = _count(dst, model)
                if n:
                    print(
                        f"Refusing: {model.__tablename__} already has {n} rows. "
                        "Use a fresh DB or pass --force.",
                        file=sys.stderr,
                    )
                    return 2

        totals: dict[str, int] = {}
        # Parents before children (FK: faceit_matches.linked_player_id → linked_players)
        for model in TABLE_MODELS:
            rows = src.scalars(select(model)).all()
            for row in rows:
                dst.merge(row)
            dst.commit()
            totals[model.__tablename__] = len(rows)
            print(f"copied {model.__tablename__}: {len(rows)}")

    print("done", totals)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
