"""Resolve Placarr foil store paths under ``data/<pack>/foil``.

Used by ``scripts/lorcana`` dumpers. Override foil data-root with
``PLACARR_EFFECTS_DIR`` (layout still ``<root>/<pack>/foil``).
"""

from __future__ import annotations

import os
from pathlib import Path


def repo_root_from(here: Path | None = None) -> Path:
    """``scripts/lorcana/paths.py`` → repo root."""
    return Path(__file__).resolve().parents[2]


def data_dir(repo: Path | None = None) -> Path:
    root = (repo or repo_root_from()).resolve()
    override = os.environ.get("PLACARR_DATA_DIR", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    return (root / "data").resolve()


def foil_data_root(repo: Path | None = None) -> Path:
    """Root that contains ``<pack>/foil`` directories."""
    override = os.environ.get("PLACARR_EFFECTS_DIR", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    return data_dir(repo)


def foil_pack_dir(repo: Path, pack: str) -> Path:
    """Binary assets for a pack (shaders, textures, web textures, …)."""
    return foil_data_root(repo) / pack / "foil"


def pack_data_dir(repo: Path, pack: str) -> Path:
    """Domain staging for a foil pack (apks, foil, logs, last-run, …)."""
    return data_dir(repo) / pack


def effects_src_dir(repo: Path, pack: str) -> Path:
    """Hand-maintained + generated JSON consumed by TypeScript."""
    return repo.resolve() / "src" / "effects" / pack


def ensure_effects_layout(repo: Path) -> Path:
    """Ensure ``data/`` exists (pack dirs are created on write)."""
    root = data_dir(repo)
    root.mkdir(parents=True, exist_ok=True)
    return root


def write_last_run(repo: Path, pack: str, payload: dict) -> Path:
    """Write ``data/<pack>/foil-last-run.json`` (not under ``foil/`` — not HTTP)."""
    import json
    from datetime import datetime, timezone

    dest_dir = pack_data_dir(repo, pack)
    dest_dir.mkdir(parents=True, exist_ok=True)
    path = dest_dir / "foil-last-run.json"
    body = {
        **payload,
        "pack": pack,
        "finishedAt": datetime.now(timezone.utc).isoformat(),
    }
    path.write_text(json.dumps(body, indent=2) + "\n", encoding="utf-8")
    return path
