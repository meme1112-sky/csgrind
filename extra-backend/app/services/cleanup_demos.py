"""Delete old local demo files after the retention window (analytics stay in the DB)."""

from __future__ import annotations

import time
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.models import FaceitMatchRecord, ValveMatchRecord

# Compressed leftovers + uncompressed dem used for re-parse.
_DEMO_SUFFIXES = {".dem", ".zst", ".gz", ".bz2", ".bin"}


def _is_demo_file(path: Path) -> bool:
    name = path.name.lower()
    if name == "parsed.dem" or name.startswith("demo"):
        return True
    return any(name.endswith(suf) for suf in _DEMO_SUFFIXES)


def _clear_path_refs(db: Session, path_str: str) -> int:
    """Clear DB columns that pointed at a deleted file."""
    cleared = 0
    for model, dem_col, arch_col in (
        (FaceitMatchRecord, FaceitMatchRecord.local_dem_path, FaceitMatchRecord.local_archive_path),
        (ValveMatchRecord, ValveMatchRecord.local_dem_path, ValveMatchRecord.local_archive_path),
    ):
        for row in db.query(model).filter((dem_col == path_str) | (arch_col == path_str)).all():
            if row.local_dem_path == path_str:
                row.local_dem_path = None
                cleared += 1
            if row.local_archive_path == path_str:
                row.local_archive_path = None
                cleared += 1
    return cleared


def cleanup_expired_demo_files(
    *,
    retention_days: int | None = None,
    dry_run: bool = False,
) -> dict:
    """
    Remove demo files under DEMOS_DIR whose mtime is older than retention_days.

    Analytics JSON in the DB is not touched. Set DEMO_RETENTION_DAYS=0 to disable.
    """
    days = settings.demo_retention_days if retention_days is None else retention_days
    if days <= 0:
        return {
            "enabled": False,
            "retention_days": days,
            "deleted_files": 0,
            "bytes_freed": 0,
            "cleared_db_refs": 0,
            "dry_run": dry_run,
        }

    root = Path(settings.demos_dir)
    if not root.is_dir():
        return {
            "enabled": True,
            "retention_days": days,
            "deleted_files": 0,
            "bytes_freed": 0,
            "cleared_db_refs": 0,
            "dry_run": dry_run,
            "note": "demos_dir missing",
        }

    cutoff = time.time() - (days * 86400)
    deleted_files = 0
    bytes_freed = 0
    cleared_db_refs = 0
    candidates: list[Path] = []

    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if not _is_demo_file(path):
            continue
        try:
            if path.stat().st_mtime >= cutoff:
                continue
        except OSError:
            continue
        candidates.append(path)

    db = SessionLocal()
    try:
        for path in candidates:
            try:
                size = path.stat().st_size
            except OSError:
                size = 0
            path_str = str(path.resolve())
            if dry_run:
                deleted_files += 1
                bytes_freed += size
                continue
            try:
                path.unlink()
            except OSError:
                continue
            deleted_files += 1
            bytes_freed += size
            cleared_db_refs += _clear_path_refs(db, path_str)
            # Also try the non-resolved path stored in older rows.
            stored = str(path)
            if stored != path_str:
                cleared_db_refs += _clear_path_refs(db, stored)

        if not dry_run:
            db.commit()
            # Remove empty match folders (best-effort).
            for dirpath in sorted(root.rglob("*"), reverse=True):
                if dirpath.is_dir():
                    try:
                        next(dirpath.iterdir())
                    except StopIteration:
                        try:
                            dirpath.rmdir()
                        except OSError:
                            pass
                    except OSError:
                        pass
    finally:
        db.close()

    return {
        "enabled": True,
        "retention_days": days,
        "deleted_files": deleted_files,
        "bytes_freed": bytes_freed,
        "bytes_freed_gb": round(bytes_freed / (1024**3), 3),
        "cleared_db_refs": cleared_db_refs,
        "dry_run": dry_run,
    }


if __name__ == "__main__":
    import json
    import sys

    dry = "--dry-run" in sys.argv
    print(json.dumps(cleanup_expired_demo_files(dry_run=dry), indent=2))
