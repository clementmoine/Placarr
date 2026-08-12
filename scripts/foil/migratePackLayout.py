#!/usr/bin/env python3
"""One-shot cut-clean migration: unify Lorcana + Pokémon pack data layout.

See plan unify_pack_data_layout — cards/{set}/{lang}/{card}/, catalog.sqlite,
cards-index.json, staging/, back.webp, card-uv-rect.json.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "lib"))
from paths import (  # noqa: E402
    foil_pack_dir,
    pack_cards_dir,
    pack_cards_index,
    pack_catalog_db,
    pack_data_dir,
    pack_staging_dir,
)

PRINT_KEY_RE = re.compile(r"^lorcana:([a-z0-9.]+)-(.+)$", re.I)
BUNDLE_STEM_RE = re.compile(
    r"^([a-z0-9.-]+)_([a-z]{2,4})_(\d{3})(?:_[a-z]+)?$", re.I
)


def _rename(src: Path, dest: Path) -> None:
    if not src.exists():
        return
    if dest.exists():
        if src.resolve() == dest.resolve():
            return
        raise FileExistsError(f"dest exists: {dest}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    src.rename(dest)


def _move_into_staging(pack_root: Path, name: str) -> None:
    src = pack_root / name
    if not src.exists():
        return
    staging = pack_root / "staging"
    staging.mkdir(parents=True, exist_ok=True)
    dest = staging / name
    if dest.exists():
        return
    print(f"  staging/{name}")
    src.rename(dest)


def migrate_lorcana(repo: Path) -> None:
    pack = "lorcana"
    root = pack_data_dir(repo, pack)
    foil = foil_pack_dir(repo, pack)
    cards = pack_cards_dir(repo, pack)
    print("── lorcana")

    # sqlite
    old_db = root / "lorcana.sqlite"
    new_db = pack_catalog_db(repo, pack)
    if old_db.exists() and not new_db.exists():
        print("  catalog.sqlite")
        old_db.rename(new_db)

    # card back
    for name in ("card_back.webp", "card_back.png"):
        src = foil / name
        if src.exists():
            dest = cards / ("back.webp" if name.endswith(".webp") else "back.png")
            print(f"  cards/{dest.name}")
            _rename(src, dest)

    # cards tree
    old_cards = foil / "cards"
    if old_cards.is_dir():
        for entry in sorted(old_cards.iterdir()):
            if not entry.is_dir():
                continue
            m = PRINT_KEY_RE.match(entry.name)
            if not m:
                print(f"  skip unknown card dir {entry.name}")
                continue
            set_code, rest = m.group(1).lower(), m.group(2).lower()
            for lang_dir in entry.iterdir():
                if not lang_dir.is_dir():
                    continue
                lang = lang_dir.name.lower()
                dest = cards / set_code / lang / rest
                if dest.exists():
                    continue
                dest.parent.mkdir(parents=True, exist_ok=True)
                # rename face files while moving
                dest.mkdir(parents=True, exist_ok=True)
                for f in lang_dir.iterdir():
                    if not f.is_file():
                        continue
                    name = f.name
                    lower = name.lower()
                    if lower.startswith("foil_mask"):
                        name = "mask" + Path(name).suffix.lower()
                    elif lower.startswith("art"):
                        name = "art" + Path(name).suffix.lower()
                    elif lower.startswith("thumb"):
                        name = "thumb" + Path(name).suffix.lower()
                    elif lower.startswith("varnish") and "second" in lower:
                        name = "second_varnish_mask" + Path(name).suffix.lower()
                    elif lower.startswith("varnish"):
                        name = "varnish_mask" + Path(name).suffix.lower()
                    _rename(f, dest / name)
                # remove empty lang dir
                try:
                    lang_dir.rmdir()
                except OSError:
                    pass
            try:
                entry.rmdir()
            except OSError:
                shutil.rmtree(entry, ignore_errors=True)
        try:
            old_cards.rmdir()
        except OSError:
            shutil.rmtree(old_cards, ignore_errors=True)

    # index → root cards-index.json (rebuild shape later in TS if needed)
    for src in (foil / "cards-index.json", root / "cards-index.json"):
        if src.exists() and src.parent == foil:
            _rename(src, pack_cards_index(repo, pack))
            break

    _move_into_staging(root, "apks")
    _move_into_staging(root, "unity-data")
    print("  done lorcana dirs")


def _pokemon_face_name(stem: str, filename: str) -> str:
    """Map Live texture filename → canonical basename."""
    base = Path(filename).stem
    ext = Path(filename).suffix.lower() or ".webp"
    low = base.lower()
    stem_l = stem.lower()

    if low == stem_l:
        return f"art{ext}"
    if "_etch_" in low or low.endswith("_etch"):
        return f"etch{ext}"
    if "_wp_mph_" in low:
        return f"mask-mph{ext}"
    if "_wp_sph_" in low:
        return f"mask-sph{ext}"
    if "_wp_ph_" in low:
        return f"mask-ph{ext}"
    if "_wp_" in low or low.startswith(stem_l.replace("_", "_wp_", 1)[:0]):
        # whiteplate: set_wp_lang_num or set_wp_ph_lang_num
        if re.search(r"_wp_(?:ph_|mph_|sph_)?", low):
            if "_wp_ph_" in low:
                return f"mask-ph{ext}"
            if "_wp_mph_" in low:
                return f"mask-mph{ext}"
            if "_wp_sph_" in low:
                return f"mask-sph{ext}"
            return f"mask{ext}"
    if "cold" in low or "foil" in low and low != stem_l:
        return f"foil{ext}"
    # default: keep art if looks like card tex
    if re.match(rf"^{re.escape(stem_l)}$", low):
        return f"art{ext}"
    return f"art{ext}" if low.startswith(stem_l.split("_")[0]) and "_wp_" not in low else filename


def _map_pokemon_file(stem: str, filename: str) -> str:
    base = Path(filename).stem.lower()
    ext = Path(filename).suffix.lower() or ".webp"
    stem_l = stem.lower()
    if base == stem_l:
        return f"art{ext}"
    if "_etch_" in base:
        return f"etch{ext}"
    if "_wp_mph_" in base:
        return f"mask-mph{ext}"
    if "_wp_sph_" in base:
        return f"mask-sph{ext}"
    if "_wp_ph_" in base:
        return f"mask-ph{ext}"
    if "_wp_" in base:
        return f"mask{ext}"
    return f"extra-{Path(filename).name}"


def migrate_pokemon(repo: Path) -> None:
    pack = "pokemon"
    root = pack_data_dir(repo, pack)
    foil = foil_pack_dir(repo, pack)
    cards = pack_cards_dir(repo, pack)
    print("── pokemon")

    old_db = root / "live-cards.sqlite"
    new_db = pack_catalog_db(repo, pack)
    if old_db.exists() and not new_db.exists():
        print("  catalog.sqlite")
        old_db.rename(new_db)

    for name in ("card_back.webp", "card_back.png"):
        src = foil / name
        if src.exists():
            dest = cards / ("back.webp" if name.endswith(".webp") else "back.png")
            print(f"  cards/{dest.name}")
            _rename(src, dest)

    quad = foil / "cardQuad.json"
    if quad.exists():
        _rename(quad, foil / "card-uv-rect.json")
        print("  foil/card-uv-rect.json")

    # reports → logs
    logs = root / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    for name in (
        "extract-report.json",
        "sources-report.json",
        "malie-bootstrap-report.json",
        "malie-bootstrap-report.json.gz",
    ):
        src = root / name
        if src.exists():
            _rename(src, logs / name)
            print(f"  logs/{name}")
    er = foil / "extract-report.json"
    if er.exists():
        _rename(er, logs / "extract-report.json")

    # textures → cards (except _shared)
    textures = foil / "textures"
    if textures.is_dir():
        entries = [e for e in textures.iterdir() if e.is_dir() and e.name != "_shared"]
        total = len(entries)
        print(f"  moving {total} bundle dirs → cards/{{set}}/{{lang}}/{{num}}")
        for i, entry in enumerate(entries):
            m = BUNDLE_STEM_RE.match(entry.name)
            if not m:
                # leave non-stem dirs under textures (rare)
                continue
            set_code, lang, num = m.group(1).lower(), m.group(2).lower(), m.group(3)
            dest = cards / set_code / lang / num
            if dest.exists():
                # merge files
                dest.mkdir(parents=True, exist_ok=True)
                for f in entry.iterdir():
                    if f.is_file():
                        _rename(f, dest / _map_pokemon_file(entry.name, f.name))
                shutil.rmtree(entry, ignore_errors=True)
            else:
                dest.parent.mkdir(parents=True, exist_ok=True)
                entry.rename(dest)
                for f in list(dest.iterdir()):
                    if f.is_file():
                        new_name = _map_pokemon_file(entry.name, f.name)
                        if new_name != f.name:
                            target = dest / new_name
                            if not target.exists():
                                f.rename(target)
            if i and i % 5000 == 0:
                print(f"    … {i}/{total}")
        print(f"  moved {total} dirs")

    # drop old cards.json copies (index regenerated separately)
    for p in (root / "cards.json", foil / "cards.json", foil / "cards-index.json"):
        if p.exists():
            bak = logs / f"legacy-{p.name}"
            _rename(p, bak)
            print(f"  archived {p.name} → logs/")

    for name in (
        "apks",
        "cdn-bundles",
        "cdn-manifests",
        "malie-databases",
        "config-cache",
    ):
        _move_into_staging(root, name)

    for name in (
        "cdn-bundle-versions.json.gz",
        "cdn-catalogue-setnum.txt",
        "malie-bundle-stems.txt",
        "scrape-inventory.json.gz",
        "scrape-inventory.txt",
    ):
        src = root / name
        if src.exists():
            staging = pack_staging_dir(repo, pack)
            staging.mkdir(parents=True, exist_ok=True)
            _rename(src, staging / name)
            print(f"  staging/{name}")

    print("  done pokemon dirs")


def main() -> None:
    repo = Path(os.environ.get("PLACARR_REPO", REPO)).resolve()
    migrate_lorcana(repo)
    migrate_pokemon(repo)
    print("migration complete")


if __name__ == "__main__":
    main()
