"""Crop square card-slot textures to the app's mesh UV rect.

Live packs every card-slot texture (art, white-plate mask, etch, cold foil,
card back) into a square with ~14.2% margin a side; the app crops through the
`Card` mesh UVs (see ``card_quad``). Cropping at dump time gives every webp
the card's true proportions, so browser surfaces can trust the image ratio and
never see the packing bands — and the WebGL crop uniform becomes unnecessary.

Idempotent: only square images are packed, a cropped card is no longer square.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

UvRect = tuple[float, float, float, float]
"""``(u0, u1, v0, v1)`` in Unity UV space (v origin bottom)."""


def load_uv_rect(pack_dir: Path) -> UvRect | None:
    """Read the mesh rect from ``<pack_dir>/card-uv-rect.json``; None without a dump."""
    path = pack_dir / "card-uv-rect.json"
    if not path.is_file():
        return None
    try:
        quad = json.loads(path.read_text(encoding="utf-8"))
        rect = quad["uvRect"]
        return (
            float(rect["u0"]),
            float(rect["u1"]),
            float(rect["v0"]),
            float(rect["v1"]),
        )
    except Exception:
        return None


def uv_rect_from_quad(quad: dict | None) -> UvRect | None:
    """The same rect straight from a ``card_quad`` dump payload."""
    if not quad:
        return None
    rect = quad.get("uvRect")
    if not rect:
        return None
    try:
        return (
            float(rect["u0"]),
            float(rect["u1"]),
            float(rect["v0"]),
            float(rect["v1"]),
        )
    except Exception:
        return None


def crop_card_image(img: Image.Image, rect: UvRect | None) -> Image.Image:
    """Square packed texture → card rect. Anything non-square passes through."""
    if rect is None or img.width != img.height:
        return img
    u0, u1, v0, v1 = rect
    left = round(u0 * img.width)
    right = round(u1 * img.width)
    # Unity v origin is bottom, PIL's is top.
    top = round((1.0 - v1) * img.height)
    bottom = round((1.0 - v0) * img.height)
    if right - left <= 0 or bottom - top <= 0:
        return img
    if right - left == img.width and bottom - top == img.height:
        return img
    return img.crop((left, top, right, bottom))
