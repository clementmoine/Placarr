"""Sync Lorcana web foil texture assets into the pack tree.

Source reference (CSS foil recipes on the official card viewer):
https://cards.disneylorcana.com

This script only copies image files under ``public/foil/lorcana/web/``.
Shader math and finish mappings live in ``src/effects/lorcana/cssRecipes.ts``
(hand-maintained) — do not generate or edit that file from here.

Usage:
    python dump_lorcana_web.py --repo /path/to/Placarr
"""

from __future__ import annotations

import argparse
import re
import shutil
import urllib.error
import urllib.request
from pathlib import Path

VIEWER_URL = "https://cards.disneylorcana.com"
FOIL_URL_RE = re.compile(
    r"url\(\s*['\"]?(?P<path>/[^)'\"]*foil[^)'\"]*)['\"]?\s*\)",
    re.IGNORECASE,
)

SKIP_DIRS = {"lorcana", "app", "unity"}
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


def repo_foil_root(repo: Path) -> Path:
    return repo / "public" / "foil"


def web_out_dir(repo: Path) -> Path:
    return repo_foil_root(repo) / "lorcana" / "web"


def local_root_textures(foil_root: Path) -> list[Path]:
    out: list[Path] = []
    if not foil_root.is_dir():
        return out
    for entry in sorted(foil_root.iterdir()):
        if not entry.is_file():
            continue
        if entry.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        out.append(entry)
    return out


def sync_local(repo: Path, dest: Path) -> list[str]:
    dest.mkdir(parents=True, exist_ok=True)
    copied: list[str] = []
    for src in local_root_textures(repo_foil_root(repo)):
        target = dest / src.name
        shutil.copy2(src, target)
        copied.append(src.name)
        print(f"  sync {src.name} -> {target.relative_to(repo)}")
    return copied


def fetch_viewer_foil_paths() -> list[str]:
    req = urllib.request.Request(
        VIEWER_URL,
        headers={"User-Agent": "Placarr-effects-dump/1.0"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        html = resp.read().decode("utf-8", errors="replace")
    paths: list[str] = []
    seen: set[str] = set()
    for m in FOIL_URL_RE.finditer(html):
        path = m.group("path").split("?")[0]
        if path not in seen:
            seen.add(path)
            paths.append(path)
    return paths


def try_fetch_remote_assets(repo: Path, dest: Path) -> None:
    try:
        paths = fetch_viewer_foil_paths()
    except (urllib.error.URLError, TimeoutError, OSError) as err:
        print(f"  Viewer fetch skipped ({err}) — local sync only")
        return
    if not paths:
        print("  Viewer fetch: no url(...foil...) references found")
        return
    print(f"  Viewer fetch: {len(paths)} foil url() reference(s)")
    for path in paths:
        name = Path(path).name
        if (dest / name).is_file():
            continue
        url = VIEWER_URL.rstrip("/") + path
        try:
            with urllib.request.urlopen(
                urllib.request.Request(
                    url, headers={"User-Agent": "Placarr-effects-dump/1.0"}
                ),
                timeout=30,
            ) as resp:
                data = resp.read()
            (dest / name).write_bytes(data)
            print(f"  fetched {name} from viewer")
        except (urllib.error.URLError, TimeoutError, OSError) as err:
            print(f"  ATTENTION fetch {url}: {err}")


def write_stub_note(repo: Path) -> None:
    note = repo / "public" / "foil" / "lorcana" / "web" / "README.txt"
    note.write_text(
        "Web foil textures for the Lorcana CSS viewer port.\n"
        "Finish → texture mapping: src/effects/lorcana/cssRecipes.ts\n"
        "Regenerate with: scripts/effects-dump/dump_lorcana_web.py\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, help="Racine du repo Placarr")
    args = parser.parse_args()

    repo = Path(args.repo)
    dest = web_out_dir(repo)

    print(f"Destination: {dest.relative_to(repo)}")
    print("Phase 1 — sync local public/foil/*.{jpg,png,...}")
    copied = sync_local(repo, dest)
    print("Phase 2 — optional viewer url(...) scrape")
    try_fetch_remote_assets(repo, dest)
    write_stub_note(repo)
    print(f"Terminé — {len(copied)} fichier(s) synchronisé(s) depuis la racine foil.")


if __name__ == "__main__":
    main()
