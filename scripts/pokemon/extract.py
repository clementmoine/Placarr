"""Extract WebGL-ready assets from scraped TCG Live UnityFS bundles.

Writes under ``data/pokemon/foil/`` (draft layout):

- ``shaders/*.frag`` — GLES3 ``#version 300 es`` fragments (platform 9)
- ``cards.json`` — MaterialManifest rows
- ``textures/`` — card + mask (+ shared foil textures from shadersbundle)

    python tcglive_extract.py --bundles-dir data/pokemon/cdn-bundles
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

import UnityPy
import lz4.block
from UnityPy.enums import ClassIDType

_HERE = Path(__file__).resolve().parent
_SCRIPTS = _HERE.parent
for _p in (_HERE, _SCRIPTS):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

from paths import ensure_effects_layout, effects_src_dir, foil_pack_dir  # noqa: E402
from card_crop import (  # noqa: E402
    UvRect,
    crop_card_image,
    load_uv_rect,
    uv_rect_from_quad,
)
from lib.save_webp import migrate_png_beside, save_lossless_webp, texture_path  # noqa: E402

TPCI_PATH_RE = re.compile(rb"TPCi/Cards3D/(?:HoloFoil|Standard)/([A-Za-z0-9]+)")
BUNDLE_RE = re.compile(
    r"^(?P<set>[a-z0-9.-]+)_(?P<lang>[a-z]{2,4})_(?P<num>\d+)(?P<suf>_[a-z])?$",
    re.IGNORECASE,
)

# Longest-first — keep in sync with src/effects/pokemon/foilNames.ts
FOIL_SHADER_NAMES = (
    "SvUltraGoldRainbow",
    "SvUltraScodix",
    "25thConfetti",
    "AngledPillars",
    "RadiantHolo",
    "CrackedIce",
    "FlatSilver",
    "SolidColor",
    "SunPillar",
    "SunBeam",
    "SunLava",
    "SwSecret",
    "AceFoil",
    "Squares",
    "Stamped",
    "Rainbow",
    "Galaxy",
    "Cosmos",
    "Tinsel",
    "Thatch",
    "SvUltra",
    "SvHolo",
    "SwHolo",
    "NonFoil",
)


def foil_manifest_to_shader(foil: str, shader_path: str = "") -> str:
    """Map MaterialManifest `_f` / `_s` → dumped `.frag` stem."""
    for raw in (foil, shader_path):
        n = (raw or "").strip()
        if not n:
            continue
        if n in FOIL_SHADER_NAMES:
            return n
        n = re.sub(r"^TPCi/Cards3D/(?:HoloFoil|Standard)/", "", n)
        n = re.sub(r"^Cards/(?:Foil|Standard)/", "", n)
        n = re.sub(r"^HoloFoil_", "", n)
        n = re.sub(r"^Standard_", "", n)
        for name in FOIL_SHADER_NAMES:
            if n == name or n.startswith(f"{name}_"):
                return name
        if re.search(r"nonfoil", n, re.I):
            return "NonFoil"
    return ""


def build_keyed_cards(rows: list[dict]) -> dict[str, dict]:
    """Bundle id → {std|ph: {foil, shader, cardTex, maskTex[, etchTex, coldFoilTex]}}."""
    out: dict[str, dict] = {}
    for row in rows:
        bid = str(row.get("bundle") or "").strip()
        variant = str(row.get("variant") or "std").strip()
        if not bid or variant not in ("std", "ph"):
            continue
        foil = str(row.get("foil") or "")
        shader_path = str(row.get("shaderPath") or "")
        shader = foil_manifest_to_shader(foil, shader_path)
        entry = {
            "foil": foil,
            "shader": shader,
            "cardTex": str(row.get("cardTex") or ""),
            "maskTex": str(row.get("maskTex") or ""),
        }
        # Per-card foil plates — omitted when absent to keep the index lean.
        etch = str(row.get("etch") or "").strip()
        cold = str(row.get("coldFoil") or "").strip()
        if etch:
            entry["etchTex"] = etch
        if cold:
            entry["coldFoilTex"] = cold
        out.setdefault(bid, {})[variant] = entry
    return out


def write_runtime_cards(repo: Path, rows: list[dict]) -> Path:
    path = effects_src_dir(repo, "pokemon") / "cards.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    keyed = build_keyed_cards(rows)
    path.write_text(
        json.dumps(keyed, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return path


def _flat(seq) -> list:
    out = []
    for v in seq or []:
        if isinstance(v, (list, tuple)):
            out.extend(v)
        else:
            out.append(v)
    return out


def _to_webgl2_fragment(src: str) -> str:
    """Isolate the GLES3 fragment body for WebGL2 (strip Unity FRAGMENT guard)."""
    i = src.find("#ifdef FRAGMENT")
    if i >= 0:
        frag = src[i + len("#ifdef FRAGMENT") :]
        end = frag.rfind("#endif")
        if end >= 0:
            frag = frag[:end]
        frag = frag.lstrip("\n")
    else:
        frag = src
        # `_glsl_programs` often splits so the FS body starts at `#version`
        # and still ends with the `#endif` that closed `#ifdef FRAGMENT`.
        stripped = frag.rstrip("\x00\x17\r\n\t ")
        if stripped.endswith("#endif"):
            frag = stripped[: stripped.rfind("#endif")]
    # Drop control bytes Unity leaves after the blob.
    frag = "".join(ch for ch in frag if ch == "\n" or ch == "\t" or ord(ch) >= 32)
    frag = frag.replace(
        "#define HLSLCC_ENABLE_UNIFORM_BUFFERS 1",
        "#define HLSLCC_ENABLE_UNIFORM_BUFFERS 0",
    )
    frag = frag.replace(
        "#define UNITY_SUPPORTS_UNIFORM_LOCATION 1",
        "#define UNITY_SUPPORTS_UNIFORM_LOCATION 0",
    )
    return frag.rstrip() + "\n"


def decompress_platform_blobs(shader) -> list[tuple[int | None, bytes]]:
    """Return ``(platform_id, decompressed_bytes)`` for each compressed chunk."""
    blob = bytes(shader.compressedBlob)
    offs = _flat(shader.offsets)
    clens = _flat(shader.compressedLengths)
    dlens = _flat(shader.decompressedLengths)
    plats = _flat(getattr(shader, "platforms", []) or [])
    out: list[tuple[int | None, bytes]] = []
    for i, (off, cl, dl) in enumerate(zip(offs, clens, dlens)):
        chunk = blob[off : off + cl]
        data = chunk if cl == dl else lz4.block.decompress(chunk, uncompressed_size=dl)
        plat = plats[i] if i < len(plats) else None
        out.append((plat, data))
    return out


def _glsl_programs(data: bytes) -> list[str]:
    """Split a decompressed shader blob into ``#version …`` programs."""
    text = data.decode("utf-8", errors="replace")
    parts: list[str] = []
    idxs = [m.start() for m in re.finditer(r"#version\s+\d+", text)]
    for i, start in enumerate(idxs):
        end = idxs[i + 1] if i + 1 < len(idxs) else len(text)
        chunk = text[start:end]
        # trim trailing NULs / junk
        nul = chunk.find("\x00")
        if nul != -1:
            chunk = chunk[:nul]
        parts.append(chunk.strip() + "\n")
    return parts


def extract_shadersbundle(path: Path, shaders_dir: Path) -> dict:
    shaders_dir.mkdir(parents=True, exist_ok=True)
    env = UnityPy.load(str(path))
    written: list[str] = []
    foil_names: list[str] = []
    for obj in env.objects:
        if obj.type != ClassIDType.Shader:
            continue
        s = obj.read()
        # Prefer platform 9 (#version 300 es)
        chunks = decompress_platform_blobs(s)
        chosen: bytes | None = None
        for plat, data in chunks:
            if plat == 9 or b"#version 300" in data:
                chosen = data
                break
        if chosen is None and chunks:
            chosen = chunks[0][1]
        if not chosen:
            continue
        try:
            parsed_name = str(getattr(s.m_ParsedForm, "m_Name", "") or "")
        except Exception:
            parsed_name = ""
        # Only TPCi card shaders — skip Unity builtins (e.g. Unlit/Texture).
        if not parsed_name.startswith("TPCi/Cards3D/"):
            m = TPCI_PATH_RE.search(chosen)
            if not m:
                for _, data in chunks:
                    m = TPCI_PATH_RE.search(data)
                    if m:
                        break
            if not m:
                continue
            foil = m.group(1).decode()
        else:
            foil = parsed_name.rsplit("/", 1)[-1]
        foil_names.append(foil)
        programs = _glsl_programs(chosen)
        # Unity HLSLcc blobs interleave VS/FS. Prefer real FS:
        # precision + SV_Target, without gl_Position.
        frag = None
        for p in programs:
            if (
                "#version 300" in p
                and "SV_Target" in p
                and "gl_Position" not in p
            ):
                frag = p
                break
        if frag is None:
            for p in programs:
                if (
                    "#version 300" in p
                    and "precision highp float" in p
                    and "gl_Position" not in p
                ):
                    frag = p
                    break
        if frag is None:
            for p in programs:
                if "#ifdef FRAGMENT" in p and "gl_Position" not in p:
                    try:
                        frag = _to_webgl2_fragment(p)
                    except Exception:
                        frag = None
                    if frag and frag.strip():
                        break
                    frag = None
        if not frag or not frag.strip():
            continue
        # Always strip `#ifdef FRAGMENT` / trailing junk — the preferred
        # `#version 300` program still carries Unity's FRAGMENT guard.
        frag_out = _to_webgl2_fragment(frag)
        dest = shaders_dir / f"{foil}.frag"
        dest.write_text(frag_out, encoding="utf-8")
        written.append(dest.name)

    # Shared textures inside shadersbundle
    tex_dir = shaders_dir.parent / "textures" / "_shared"
    tex_dir.mkdir(parents=True, exist_ok=True)
    tex_n = 0
    # Unity `m_ColorSpace`: 1 = sRGB (hardware-linearised on sample in the
    # app's Linear pipeline), 0 = raw data (normals / direction / noise maps).
    tex_flags: dict[str, dict] = {}
    for obj in env.objects:
        if obj.type != ClassIDType.Texture2D:
            continue
        data = obj.read()
        name = data.m_Name or f"tex_{obj.path_id}"
        try:
            tree = obj.read_typetree()
            tex_flags[name] = {"srgb": int(tree.get("m_ColorSpace") or 0) == 1}
        except Exception:
            pass
        try:
            img = data.image
            dest = texture_path(tex_dir, name)
            if not migrate_png_beside(dest):
                save_lossless_webp(img, dest)
            tex_n += 1
        except Exception:
            continue

    return {
        "shadersWritten": sorted(set(written)),
        "foilNames": sorted(set(foil_names)),
        "sharedTextures": tex_n,
        "textureFlags": tex_flags,
    }


# Unity editor internals — not shader uniforms.
_SHEET_SKIP_FLOATS = {"__dirty", "_StencilComp", "_StencilRef"}


def write_material_sheets(repo: Path, shadersbundle: Path) -> Path:
    """`MAT_Cards3D_*` m_Floats / m_Colors → per-leaf uniform sheet JSON.

    The runtime binds these as the material's recorded uniforms — without
    them every leaf runs with zeroed floats (`_LightDirection` (0,1,0) above
    all: the app authors its card flat, normal +Y).
    """
    env = UnityPy.load(str(shadersbundle))
    sheets: dict[str, dict] = {}
    for obj in env.objects:
        if obj.type != ClassIDType.Material:
            continue
        m = obj.read()
        name = str(m.m_Name or "")
        if not name.startswith("MAT_Cards3D_"):
            continue
        props = m.m_SavedProperties
        floats_raw = props.m_Floats
        colors_raw = props.m_Colors
        floats_raw = dict(
            floats_raw.items() if hasattr(floats_raw, "items") else floats_raw
        )
        colors_raw = dict(
            colors_raw.items() if hasattr(colors_raw, "items") else colors_raw
        )
        floats = {
            k: round(float(v), 6)
            for k, v in sorted(floats_raw.items())
            if k not in _SHEET_SKIP_FLOATS
        }
        colors = {}
        for k, v in sorted(colors_raw.items()):
            rgba = (
                (v.r, v.g, v.b, v.a)
                if hasattr(v, "r")
                else (v[0], v[1], v[2], v[3])
            )
            colors[k] = [round(float(c), 6) for c in rgba]
        sheets[name.removeprefix("MAT_Cards3D_")] = {
            "floats": floats,
            "colors": colors,
        }
    path = effects_src_dir(repo, "pokemon") / "materialSheets.json"
    path.write_text(
        json.dumps(sheets, indent=1, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return path


def extract_card_bundle(
    path: Path,
    textures_dir: Path,
    *,
    texture_mode: str = "cards",
    crop_rect: UvRect | None = None,
) -> list[dict]:
    """Return MaterialManifest rows; optionally write textures.

    ``texture_mode``:
    - ``cards`` (default) — ``_c`` art + ``_w`` / etch from manifests (local
      provider art; TCGdex fills gaps at runtime)
    - ``masks`` — foil/etch masks only
    - ``all`` — every Texture2D (slow, huge)
    - ``none`` — manifests only
    """
    env = UnityPy.load(str(path))
    rows: list[dict] = []

    for obj in env.objects:
        if obj.type != ClassIDType.MonoBehaviour:
            continue
        try:
            tree = obj.read_typetree()
        except Exception:
            continue
        name = str(tree.get("m_Name") or "")
        if not name.startswith("MaterialManifest"):
            continue
        variant = "ph" if name.endswith("_ph") else "std"
        rows.append(
            {
                "bundle": path.name,
                "variant": variant,
                "shaderPath": tree.get("_s") or "",
                "foil": tree.get("_f") or "",
                "cardTex": tree.get("_c") or "",
                "maskTex": tree.get("_w") or "",
                "matPath": tree.get("_p") or "",
                "coldFoil": tree.get("_cf") or "",
                "etch": tree.get("_e") or "",
            }
        )

    if texture_mode == "none":
        return rows

    wanted: set[str] | None = None
    if texture_mode in ("masks", "cards"):
        wanted = set()
        keys = (
            ("maskTex", "etch", "coldFoil")
            if texture_mode == "masks"
            else ("maskTex", "etch", "coldFoil", "cardTex")
        )
        for row in rows:
            for key in keys:
                value = str(row.get(key) or "").strip()
                if value:
                    wanted.add(value)
        if not wanted:
            return rows

    textures_dir.mkdir(parents=True, exist_ok=True)
    for obj in env.objects:
        if obj.type != ClassIDType.Texture2D:
            continue
        data = obj.read()
        name = data.m_Name or f"tex_{obj.path_id}"
        if wanted is not None and name not in wanted:
            continue
        dest = texture_path(textures_dir, name)
        if migrate_png_beside(dest):
            continue
        try:
            # Card-slot textures ship packed square — crop to the mesh rect so
            # the file itself has card proportions (see `card_crop`).
            save_lossless_webp(crop_card_image(data.image, crop_rect), dest)
        except Exception:
            pass
    return rows


def _extract_one_card(
    payload: tuple[str, str, str, UvRect | None],
) -> tuple[list[dict], str | None]:
    """Worker entry: ``(bundle_path, textures_root, texture_mode, crop_rect)``."""
    path_s, textures_root, texture_mode, crop_rect = payload
    path = Path(path_s)
    try:
        rows = extract_card_bundle(
            path,
            Path(textures_root) / path.name,
            texture_mode=texture_mode,
            crop_rect=crop_rect,
        )
        return rows, None
    except Exception as err:
        return [], f"{path.name}: {err}"


def extract_all(
    bundles_dir: Path,
    pack_dir: Path,
    *,
    limit_cards: int = 0,
    repo: Path | None = None,
    texture_mode: str = "cards",
    workers: int = 1,
) -> dict:
    from concurrent.futures import ProcessPoolExecutor, as_completed

    if texture_mode not in ("cards", "masks", "all", "none"):
        raise ValueError(
            f"texture_mode must be cards|masks|all|none, got {texture_mode!r}"
        )

    pack_dir.mkdir(parents=True, exist_ok=True)
    shaders_dir = pack_dir / "shaders"
    textures_dir = pack_dir / "textures"
    cards: list[dict] = []

    card_quad: dict | None = None
    crop_rect: UvRect | None = None
    if repo is not None:
        from card_back import dump_pokemon_card_back
        from card_quad import dump_pokemon_card_quad

        # The crop the app applies to every square card-slot texture. Lives in
        # the mesh UVs, not in any material — see `card_quad`. Dumped first:
        # the card back and every card texture below are cropped through it.
        card_quad = dump_pokemon_card_quad(repo, pack_dir / "cardQuad.json")
        crop_rect = uv_rect_from_quad(card_quad) or load_uv_rect(pack_dir)
        dump_pokemon_card_back(repo, pack_dir, crop_rect=crop_rect)

    sh = bundles_dir / "shadersbundle"
    shader_report: dict = {}
    if sh.is_file():
        shader_report = extract_shadersbundle(sh, shaders_dir)
        write_material_sheets(repo, sh)
        # Per-texture colour space — the renderer needs it to sample shared
        # motifs the way the app's Linear pipeline does.
        tex_flags = shader_report.pop("textureFlags", {})
        if repo is not None and tex_flags:
            flags_path = effects_src_dir(repo, "pokemon") / "textureFlags.json"
            flags_path.write_text(
                json.dumps(tex_flags, indent=1, sort_keys=True) + "\n",
                encoding="utf-8",
            )

    card_files = sorted(
        p
        for p in bundles_dir.iterdir()
        if p.is_file() and BUNDLE_RE.match(p.name)
    )
    if limit_cards:
        card_files = card_files[:limit_cards]

    errors = 0
    n_workers = max(1, int(workers))
    print(
        f"  cards extract mode={texture_mode} workers={n_workers} "
        f"bundles={len(card_files)}",
        flush=True,
    )

    if n_workers == 1:
        for i, path in enumerate(card_files, 1):
            try:
                rows = extract_card_bundle(
                    path,
                    textures_dir / path.name,
                    texture_mode=texture_mode,
                    crop_rect=crop_rect,
                )
                cards.extend(rows)
            except Exception as err:
                errors += 1
                if errors <= 10:
                    print(f"  FAIL {path.name}: {err}", flush=True)
            if i % 200 == 0 or i == len(card_files):
                print(
                    f"  cards {i}/{len(card_files)} manifests={len(cards)}",
                    flush=True,
                )
    else:
        payloads = [
            (str(p), str(textures_dir), texture_mode, crop_rect)
            for p in card_files
        ]
        done = 0
        with ProcessPoolExecutor(max_workers=n_workers) as pool:
            futures = [pool.submit(_extract_one_card, p) for p in payloads]
            for fut in as_completed(futures):
                rows, err = fut.result()
                done += 1
                if err:
                    errors += 1
                    if errors <= 10:
                        print(f"  FAIL {err}", flush=True)
                else:
                    cards.extend(rows)
                if done % 200 == 0 or done == len(card_files):
                    print(
                        f"  cards {done}/{len(card_files)} manifests={len(cards)}",
                        flush=True,
                    )

    cards_path = pack_dir / "cards.json"
    cards_path.write_text(
        json.dumps({"cards": cards, "count": len(cards)}, indent=2) + "\n",
        encoding="utf-8",
    )
    runtime_cards: str | None = None
    if repo is not None:
        runtime_cards = str(write_runtime_cards(repo, cards))
        print(
            f"  runtime cards → {runtime_cards} ({len(build_keyed_cards(cards))} bundles)",
            flush=True,
        )

    # Self-healing: textures dumped before cropping existed (`migrate_png_beside`
    # skips files already on disk) stay square forever without this pass. Nearly
    # free once everything is cropped — squareness is a header read, non-square
    # files are never decoded.
    crop_report: dict | None = None
    if crop_rect is not None and texture_mode != "none":
        crop_report = crop_existing_textures(pack_dir, workers=n_workers)

    meta = {
        "shaders": shader_report,
        "cardBundlesProcessed": len(card_files),
        "manifestRows": len(cards),
        "keyedBundles": len(build_keyed_cards(cards)),
        "extractErrors": errors,
        "textureMode": texture_mode,
        "workers": n_workers,
        "packDir": str(pack_dir),
        "runtimeCards": runtime_cards,
        "cardQuad": card_quad,
        "cropExisting": crop_report,
    }
    (pack_dir / "extract-report.json").write_text(
        json.dumps(meta, indent=2) + "\n", encoding="utf-8"
    )
    return meta

def _crop_bundle_dir(payload: tuple[str, UvRect]) -> tuple[int, str | None]:
    """Worker: crop every still-square webp of one bundle dir in place."""
    from PIL import Image

    dir_s, rect = payload
    cropped = 0
    try:
        for path in Path(dir_s).glob("*.webp"):
            with Image.open(path) as img:
                if img.width != img.height:
                    continue
                img.load()
                out = crop_card_image(img, rect)
                if out is img:
                    continue
                save_lossless_webp(out, path)
                cropped += 1
    except Exception as err:
        return cropped, f"{Path(dir_s).name}: {err}"
    return cropped, None


def crop_existing_textures(pack_dir: Path, *, workers: int = 1) -> dict:
    """One-shot: crop already-dumped textures (and the card back) in place.

    ``_shared`` motifs tile the whole card and are not packed — skipped.
    """
    rect = load_uv_rect(pack_dir)
    if rect is None:
        raise SystemExit(f"missing {pack_dir / 'cardQuad.json'} — run a dump first")

    from concurrent.futures import ProcessPoolExecutor, as_completed

    textures_dir = pack_dir / "textures"
    bundle_dirs = sorted(
        p
        for p in textures_dir.iterdir()
        if p.is_dir() and p.name != "_shared"
    )
    print(
        f"  crop existing: {len(bundle_dirs)} bundle dirs, workers={workers}",
        flush=True,
    )

    cropped = 0
    errors = 0
    done = 0
    n_workers = max(1, int(workers))
    if n_workers == 1:
        results = (_crop_bundle_dir((str(p), rect)) for p in bundle_dirs)
        iterator = results
    else:
        pool = ProcessPoolExecutor(max_workers=n_workers)
        futures = [
            pool.submit(_crop_bundle_dir, (str(p), rect)) for p in bundle_dirs
        ]
        iterator = (fut.result() for fut in as_completed(futures))
    for n, err in iterator:
        cropped += n
        done += 1
        if err:
            errors += 1
            if errors <= 10:
                print(f"  FAIL {err}", flush=True)
        if done % 500 == 0 or done == len(bundle_dirs):
            print(
                f"  crop {done}/{len(bundle_dirs)} files={cropped}",
                flush=True,
            )
    if n_workers > 1:
        pool.shutdown()

    # The back is a card-slot texture too; `full_foil_mask.webp` is synthetic
    # full-coverage and stays whole.
    back = pack_dir / "card_back.webp"
    if back.is_file():
        from PIL import Image

        with Image.open(back) as img:
            if img.width == img.height:
                img.load()
                save_lossless_webp(crop_card_image(img, rect), back)
                cropped += 1

    return {"bundleDirs": len(bundle_dirs), "cropped": cropped, "errors": errors}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--repo",
        type=Path,
        default=Path(__file__).resolve().parents[2],
    )
    ap.add_argument("--bundles-dir", type=Path, default=None)
    ap.add_argument("--pack-dir", type=Path, default=None)
    ap.add_argument("--limit-cards", type=int, default=0)
    ap.add_argument(
        "--textures",
        choices=("cards", "masks", "all", "none"),
        default="cards",
        help="cards=art+masks (default); masks; all Texture2D; none=manifests only",
    )
    ap.add_argument(
        "--workers",
        type=int,
        default=max(1, (os.cpu_count() or 4) // 2),
        help="Parallel card extract processes (default ~ half CPUs)",
    )
    ap.add_argument(
        "--crop-existing",
        action="store_true",
        help="One-shot: crop already-dumped square textures in place, then exit",
    )
    args = ap.parse_args(argv)
    repo = args.repo.resolve()
    ensure_effects_layout(repo)
    bundles = (
        Path(args.bundles_dir).resolve()
        if args.bundles_dir
        else repo / "data" / "pokemon" / "cdn-bundles"
    )
    pack = (
        Path(args.pack_dir).resolve()
        if args.pack_dir
        else foil_pack_dir(repo, "pokemon")
    )
    if args.crop_existing:
        report = crop_existing_textures(pack, workers=max(1, args.workers))
        print(json.dumps(report, indent=2))
        return 0 if report.get("errors", 0) == 0 else 1
    if not bundles.is_dir():
        print(f"missing bundles dir: {bundles}", file=sys.stderr)
        return 2
    print(f"Extract {bundles} → {pack}", flush=True)
    meta = extract_all(
        bundles,
        pack,
        limit_cards=args.limit_cards,
        repo=repo,
        texture_mode=args.textures,
        workers=args.workers,
    )
    print(json.dumps(meta, indent=2))
    return 0 if meta.get("extractErrors", 0) == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
