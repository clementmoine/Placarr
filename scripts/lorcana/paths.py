"""Pack paths for ``scripts/lorcana`` — see ``scripts/lib/paths.py``.

Loaded via ``importlib`` so ``PYTHONPATH=scripts/lorcana`` cannot recurse
into this shim when resolving ``paths``.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

_LIB_PATHS = Path(__file__).resolve().parents[1] / "lib" / "paths.py"
_spec = importlib.util.spec_from_file_location(
    "_placarr_lib_paths",
    _LIB_PATHS,
)
if _spec is None or _spec.loader is None:
    raise ImportError(f"cannot load {_LIB_PATHS}")
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

data_dir = _mod.data_dir
effects_src_dir = _mod.effects_src_dir
ensure_effects_layout = _mod.ensure_effects_layout
foil_data_root = _mod.foil_data_root
foil_pack_dir = _mod.foil_pack_dir
pack_cards_dir = _mod.pack_cards_dir
pack_cards_index = _mod.pack_cards_index
pack_catalog_db = _mod.pack_catalog_db
pack_data_dir = _mod.pack_data_dir
pack_staging_dir = _mod.pack_staging_dir
pack_apks_dir = _mod.pack_apks_dir
pack_unity_data_dir = _mod.pack_unity_data_dir
repo_root_from = _mod.repo_root_from
write_last_run = _mod.write_last_run

__all__ = [
    "data_dir",
    "effects_src_dir",
    "ensure_effects_layout",
    "foil_data_root",
    "foil_pack_dir",
    "pack_cards_dir",
    "pack_cards_index",
    "pack_catalog_db",
    "pack_data_dir",
    "pack_staging_dir",
    "pack_apks_dir",
    "pack_unity_data_dir",
    "repo_root_from",
    "write_last_run",
]
