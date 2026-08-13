"""Lossless WebP writers for Unity foil dumps (Pillow)."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

TEXTURE_EXT = ".webp"


def texture_path(directory: Path, name: str) -> Path:
    """``textures/<name>.webp`` (name is the Unity ``m_Name``, no extension)."""
    return directory / f"{name}{TEXTURE_EXT}"


def save_lossless_webp(img: Image.Image, dest: Path) -> Path:
    """Write ``dest`` as lossless WebP (forces ``.webp`` suffix).

    Atomic: write a sibling ``.tmp`` then rename so a crash never leaves a
    0-byte / half-written ``.webp`` that later passes ``exists()`` checks.
    """
    out = dest if dest.suffix.lower() == TEXTURE_EXT else dest.with_suffix(TEXTURE_EXT)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(out.suffix + ".tmp")
    try:
        # method=6 = slowest / best compression; lossless keeps Unity pixels exact.
        img.save(tmp, format="WEBP", lossless=True, method=6)
        tmp.replace(out)
    except Exception:
        try:
            tmp.unlink(missing_ok=True)
        except TypeError:
            if tmp.is_file():
                tmp.unlink()
        raise
    return out


def migrate_png_beside(webp_dest: Path) -> bool:
    """If a legacy ``.png`` sibling exists, convert it and remove the PNG.

    Returns True when ``webp_dest`` is ready (already present or migrated).
    Truncated / corrupt / empty WebPs return False so the caller can re-dump.
    """
    if webp_dest.is_file() and webp_dest.stat().st_size > 0:
        return True
    if webp_dest.is_file() and webp_dest.stat().st_size == 0:
        try:
            webp_dest.unlink()
        except OSError:
            pass
    png = webp_dest.with_suffix(".png")
    if not png.is_file() or png.stat().st_size <= 0:
        return False
    try:
        with Image.open(png) as img:
            img.load()  # force full decode — truncated files fail here
            save_lossless_webp(img, webp_dest)
    except Exception:
        return False
    try:
        png.unlink()
    except OSError:
        pass
    return webp_dest.is_file() and webp_dest.stat().st_size > 0
