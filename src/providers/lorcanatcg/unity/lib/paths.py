"""Resolve Placarr pack paths under ``data/<pack>/{foil,cards,staging}``.

Public URLs: ``/assets/<pack>/…``. Override with ``PLACARR_DATA_DIR`` /
``PLACARR_EFFECTS_DIR``.
"""

from __future__ import annotations

import os
from pathlib import Path


def repo_root_from(here: Path | None = None) -> Path:
    """Walk up from this file (or ``here``) until ``package.json`` + ``src/providers``."""
    start = (here or Path(__file__)).resolve()
    if start.is_file():
        start = start.parent
    for candidate in [start, *start.parents]:
        if (candidate / "package.json").is_file() and (
            candidate / "src" / "providers"
        ).is_dir():
            return candidate
    raise RuntimeError("cannot locate Placarr repo root from paths.py")


def data_dir(repo: Path | None = None) -> Path:
    root = (repo or repo_root_from()).resolve()
    override = os.environ.get("PLACARR_DATA_DIR", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    return (root / "data").resolve()


def foil_data_root(repo: Path | None = None) -> Path:
    override = os.environ.get("PLACARR_EFFECTS_DIR", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    return data_dir(repo)


def foil_pack_dir(repo: Path, pack: str) -> Path:
    return foil_data_root(repo) / pack / "foil"


def pack_cards_dir(repo: Path, pack: str) -> Path:
    return foil_data_root(repo) / pack / "cards"


def pack_staging_dir(repo: Path, pack: str) -> Path:
    return data_dir(repo) / pack / "staging"


def pack_apks_dir(repo: Path, pack: str) -> Path:
    return pack_staging_dir(repo, pack) / "apks"


def pack_unity_data_dir(repo: Path, pack: str) -> Path:
    return pack_staging_dir(repo, pack) / "unity-data"


def pack_catalog_db(repo: Path, pack: str) -> Path:
    return data_dir(repo) / pack / "catalog.sqlite"


def pack_cards_index(repo: Path, pack: str) -> Path:
    return data_dir(repo) / pack / "cards-index.json"


def pack_data_dir(repo: Path, pack: str) -> Path:
    return data_dir(repo) / pack


def effects_src_dir(repo: Path, pack: str) -> Path:
    return repo.resolve() / "src" / "effects" / pack


def ensure_effects_layout(repo: Path) -> Path:
    root = data_dir(repo)
    root.mkdir(parents=True, exist_ok=True)
    return root


def write_last_run(repo: Path, pack: str, payload: dict) -> Path:
    """Write ``data/<pack>/logs/last-run.json`` (ops report, not HTTP)."""
    import json
    from datetime import datetime, timezone

    dest_dir = pack_data_dir(repo, pack) / "logs"
    dest_dir.mkdir(parents=True, exist_ok=True)
    path = dest_dir / "last-run.json"
    body = {
        **payload,
        "pack": pack,
        "finishedAt": datetime.now(timezone.utc).isoformat(),
    }
    path.write_text(json.dumps(body, indent=2) + "\n", encoding="utf-8")
    return path
