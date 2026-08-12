#!/usr/bin/env python3
"""Rebuild data/<pack>/cards-index.json (v1) after layout migration."""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
BUNDLE_RE = re.compile(r"^([a-z0-9.-]+)_([a-z]{2,4})_(\d{3})$", re.I)
PRINT_RE = re.compile(r"^lorcana:([a-z0-9.]+)-(.+)$", re.I)


def rebuild_lorcana() -> None:
    cards_dir = REPO / "data/lorcana/cards"
    index = {
        "version": 1,
        "pack": "lorcana",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "cards": {},
    }
    if not cards_dir.is_dir():
        print("no lorcana cards")
        return
    for set_dir in sorted(cards_dir.iterdir()):
        if not set_dir.is_dir():
            continue
        set_code = set_dir.name
        for lang_dir in sorted(set_dir.iterdir()):
            if not lang_dir.is_dir():
                continue
            lang = lang_dir.name
            for card_dir in sorted(lang_dir.iterdir()):
                if not card_dir.is_dir():
                    continue
                card = card_dir.name
                lang_files: dict[str, str] = {}
                for f in card_dir.iterdir():
                    if not f.is_file():
                        continue
                    stem = f.stem.lower()
                    name = f.name
                    if stem == "art":
                        lang_files["art"] = name
                    elif stem == "thumb":
                        lang_files["thumb"] = name
                    elif stem == "mask" or stem.startswith("mask"):
                        lang_files["mask"] = name
                    elif "second" in stem and "varnish" in stem:
                        lang_files["secondVarnishMask"] = name
                    elif "varnish" in stem:
                        lang_files["varnishMask"] = name
                    elif stem == "back":
                        lang_files["back"] = name
                parts = card.split("-", 1)
                if len(parts) == 2 and parts[1]:
                    print_key = f"lorcana:{set_code}-{parts[0]}-{parts[1]}"
                else:
                    print_key = f"lorcana:{set_code}-{card}"
                entry = index["cards"].setdefault(
                    print_key, {"set": set_code, "card": card, "langs": {}}
                )
                entry["langs"][lang] = lang_files
    out = REPO / "data/lorcana/cards-index.json"
    body = json.dumps(index, separators=(",", ":")) + "\n"
    out.write_text(body, encoding="utf-8")
    print(f"lorcana: {len(index['cards'])} prints → {out}")


def rebuild_pokemon() -> None:
    cards_dir = REPO / "data/pokemon/cards"
    index = {
        "version": 1,
        "pack": "pokemon",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "cards": {},
    }
    if not cards_dir.is_dir():
        print("no pokemon cards")
        return
    n = 0
    for set_dir in cards_dir.iterdir():
        if not set_dir.is_dir():
            continue
        set_code = set_dir.name
        for lang_dir in set_dir.iterdir():
            if not lang_dir.is_dir():
                continue
            lang = lang_dir.name
            for card_dir in lang_dir.iterdir():
                if not card_dir.is_dir():
                    continue
                card = card_dir.name
                stem = f"{set_code}_{lang}_{card}"
                if not BUNDLE_RE.match(stem):
                    continue
                lang_files: dict = {}
                variants: dict = {}
                for f in card_dir.iterdir():
                    if not f.is_file():
                        continue
                    low = f.name.lower()
                    if low.startswith("art."):
                        lang_files["art"] = f.name
                    elif low in ("mask.webp", "mask.png", "mask.jpg"):
                        lang_files["mask"] = f.name
                    elif low.startswith("mask-ph."):
                        variants.setdefault("ph", {})["mask"] = f.name
                    elif low.startswith("mask-mph."):
                        variants.setdefault("mph", {})["mask"] = f.name
                    elif low.startswith("mask-sph."):
                        variants.setdefault("sph", {})["mask"] = f.name
                    elif low.startswith("etch."):
                        lang_files["etch"] = f.name
                    elif low.startswith("back."):
                        lang_files["back"] = f.name
                if variants:
                    lang_files["variants"] = variants
                index["cards"][stem] = {
                    "set": set_code,
                    "card": card,
                    "langs": {lang: lang_files},
                }
                n += 1
                if n % 10000 == 0:
                    print(f"  … {n}")
    out = REPO / "data/pokemon/cards-index.json"
    out.write_text(json.dumps(index, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"pokemon: {len(index['cards'])} stems → {out}")


def main() -> None:
    rebuild_lorcana()
    rebuild_pokemon()


if __name__ == "__main__":
    main()
