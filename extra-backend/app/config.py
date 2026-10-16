from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    host: str = "0.0.0.0"
    port: int = 8000
    # production | development — used to enforce INTERNAL_API_SECRET when set to production
    environment: str = "development"

    faceit_key: str = ""
    faceit_download_token: str = ""
    faceit_api_base: str = "https://open.faceit.com"
    faceit_download_api_base: str = "https://open.faceit.com"

    database_url: str = "sqlite:///./data/csgrind_demos.db"
    demos_dir: Path = Path("./data/demos")
    # Delete local demo files older than N days (0 = keep forever). Analytics in DB are kept.
    demo_retention_days: int = Field(default=14, ge=0, le=3650)

    # Parallel download+parse for GET /v1/analytics/by-steam (1 = sequential). Higher = faster wall time but more FACEIT/CPU load.
    match_pipeline_max_workers: int = Field(default=4, ge=1, le=32)

    redis_url: str = "redis://localhost:6379/0"
    celery_eager: bool = False

    # Proactive demo archival when a profile is first viewed.
    archive_scan_recent: int = Field(default=3, ge=1, le=100_000)
    archive_dedupe_hours: int = Field(default=6, ge=0, le=168)

    # Valve MM match history (GetNextMatchSharingCode + optional demo fetch)
    steam_api_key: str = ""
    valve_codes_secret: str = ""
    valve_sync_max_matches: int = Field(default=8, ge=1, le=50)

    # Shared secret for Next.js / Express → FastAPI (header: X-Internal-Token)
    internal_api_secret: str = ""

    @property
    def is_production(self) -> bool:
        return (self.environment or "").strip().lower() in {"production", "prod"}


settings = Settings()
