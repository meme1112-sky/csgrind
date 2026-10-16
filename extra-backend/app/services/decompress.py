from __future__ import annotations

import bz2
import gzip
import shutil
from pathlib import Path

import zstandard as zstd


def decompress_to_dem(archive: Path, dem_out: Path) -> Path:
    """
    Decompress .dem.bz2 / .dem.gz / .dem.zst (or plain .dem) into dem_out (.dem).
    """
    dem_out.parent.mkdir(parents=True, exist_ok=True)
    name = archive.name.lower()

    if (
        name.endswith(".dem")
        and not name.endswith(".dem.gz")
        and not name.endswith(".dem.zst")
        and not name.endswith(".dem.bz2")
    ):
        shutil.copy2(archive, dem_out)
        return dem_out

    if name.endswith(".dem.bz2") or (name.endswith(".bz2") and ".dem" in name):
        with bz2.open(archive, "rb") as src, open(dem_out, "wb") as dst:
            shutil.copyfileobj(src, dst)
        return dem_out

    if name.endswith(".dem.gz") or (name.endswith(".gz") and ".dem" in name):
        with gzip.open(archive, "rb") as src, open(dem_out, "wb") as dst:
            shutil.copyfileobj(src, dst)
        return dem_out

    if name.endswith(".dem.zst") or name.endswith(".zst"):
        dctx = zstd.ZstdDecompressor()
        with open(archive, "rb") as src, open(dem_out, "wb") as dst:
            dctx.copy_stream(src, dst)
        return dem_out

    raise ValueError(f"Unsupported demo archive format: {archive.name}")
