"""Extract TCG Live pack card back (``cardBack`` Texture2D) from the APK."""

from __future__ import annotations

import sys
from pathlib import Path

import UnityPy
from UnityPy.enums import ClassIDType

_SCRIPTS = Path(__file__).resolve().parents[1]
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from card_crop import UvRect, crop_card_image  # noqa: E402
from lib.save_webp import save_lossless_webp  # noqa: E402

# Live ships the default paper back as Texture2D ``cardBack`` in base.apk.
CARD_BACK_NAMES = ("cardback", "card_back")


def dump_card_back_from_apk(
    apk: Path, dest: Path, crop_rect: UvRect | None = None
) -> bool:
    """Write ``dest`` (usually ``data/pokemon/foil/card_back.webp``)."""
    if not apk.is_file():
        return False
    try:
        env = UnityPy.load(str(apk))
    except Exception as err:
        print(f"  card back: failed to load {apk.name}: {err}", flush=True)
        return False

    wanted = set(CARD_BACK_NAMES)
    out = dest if dest.suffix.lower() == ".webp" else dest.with_suffix(".webp")
    for obj in env.objects:
        if obj.type not in (ClassIDType.Texture2D, ClassIDType.Sprite):
            continue
        try:
            data = obj.read()
            name = (getattr(data, "m_Name", None) or "").strip()
        except Exception:
            continue
        if name.lower() not in wanted:
            continue
        img = getattr(data, "image", None)
        if img is None:
            print(f"  card back: {name} undecodable", flush=True)
            continue
        # The back is packed square like every card-slot texture.
        save_lossless_webp(crop_card_image(img, crop_rect), out)
        legacy = out.with_suffix(".png")
        if legacy.is_file():
            try:
                legacy.unlink()
            except OSError:
                pass
        print(f"  card back: {name} {img.size} → {out}", flush=True)
        return True
    print(f"  card back: not found in {apk.name} ({CARD_BACK_NAMES})", flush=True)
    return False


def dump_pokemon_card_back(
    repo: Path,
    pack_dir: Path | None = None,
    crop_rect: UvRect | None = None,
) -> bool:
    """Prefer ``data/pokemon/apks/base.apk`` → ``data/pokemon/foil/card_back.webp``."""
    apk = repo / "data" / "pokemon" / "apks" / "base.apk"
    dest = (pack_dir or (repo / "data" / "pokemon" / "foil")) / "card_back.webp"
    return dump_card_back_from_apk(apk, dest, crop_rect)
