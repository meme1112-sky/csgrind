import enum
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class MatchStatus(str, enum.Enum):
    pending = "pending"
    no_demo = "no_demo"
    downloading = "downloading"
    decompressing = "decompressing"
    parsing = "parsing"
    parsed = "parsed"
    failed = "failed"


class LinkedPlayer(Base):
    __tablename__ = "linked_players"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    faceit_player_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    nickname: Mapped[str] = mapped_column(String(256))
    # SteamID64 used to resolve this FACEIT player. Lets GET /v1/analytics/by-steam serve cached
    # analytics instantly (no FACEIT round-trip) once the player has been resolved once.
    steam_id: Mapped[str | None] = mapped_column(String(32), index=True, nullable=True)
    demos_archive_enqueued_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    matches: Mapped[list["FaceitMatchRecord"]] = relationship(back_populates="linked_player")


class FaceitMatchRecord(Base):
    __tablename__ = "faceit_matches"

    match_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    player_faceit_id: Mapped[str] = mapped_column(String(64), index=True)
    game: Mapped[str] = mapped_column(String(32), default="cs2")
    status: Mapped[str] = mapped_column(String(32), default=MatchStatus.pending.value, index=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    demo_resource_urls: Mapped[list | None] = mapped_column(JSON, nullable=True)
    local_archive_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    local_dem_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    parse_summary: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    analytics: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # FACEIT lobby result for player_faceit_id: map_name, score_us/them, outcome (W/L).
    match_meta: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    match_started_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    match_finished_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    linked_player_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("linked_players.id", ondelete="SET NULL"), nullable=True
    )
    linked_player: Mapped["LinkedPlayer | None"] = relationship(back_populates="matches")


class ValveMmLink(Base):
    """Steam match-history auth + latest share code for Valve MM demo sync."""

    __tablename__ = "valve_mm_links"

    steam_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    auth_code_encrypted: Mapped[str] = mapped_column(Text)
    latest_share_code: Mapped[str] = mapped_column(String(128))
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ValveMatchRecord(Base):
    __tablename__ = "valve_matches"

    share_code: Mapped[str] = mapped_column(String(128), primary_key=True)
    steam_id: Mapped[str] = mapped_column(String(32), index=True)
    match_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    reservation_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    tv_port: Mapped[int | None] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(String(32), default=MatchStatus.pending.value, index=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    demo_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    local_archive_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    local_dem_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    parse_summary: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    analytics: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
