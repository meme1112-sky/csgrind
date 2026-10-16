from datetime import datetime

from pydantic import BaseModel, Field


class LinkPlayerBody(BaseModel):
    nickname: str = Field(min_length=1, max_length=256)


class LinkPlayerResponse(BaseModel):
    id: str
    faceit_player_id: str
    nickname: str


class MatchOut(BaseModel):
    match_id: str
    player_faceit_id: str
    game: str
    status: str
    error_message: str | None
    demo_resource_urls: list[str] | None
    local_archive_path: str | None
    local_dem_path: str | None
    parse_summary: dict | None
    analytics: dict | None = None
    match_meta: dict | None = None
    match_started_at: int | None
    match_finished_at: int | None

    model_config = {"from_attributes": True}


class ValveLinkBody(BaseModel):
    """Auth is required for first link; omit/blank to keep the stored code when updating share."""

    auth_code: str = Field(default="", max_length=64)
    share_code: str = Field(min_length=10, max_length=128)


class ValveLinkResponse(BaseModel):
    steam_id: str
    linked: bool
    latest_share_code: str
    sync: dict | None = None


class ValveMatchOut(BaseModel):
    share_code: str
    match_id: str | None = None
    steam_id: str
    status: str
    error_message: str | None = None
    demo_url: str | None = None
    local_archive_path: str | None = None
    local_dem_path: str | None = None
    parse_summary: dict | None = None
    analytics: dict | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}
