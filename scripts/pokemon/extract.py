"""Extract WebGL-ready assets from scraped TCG Live UnityFS bundles.

Writes under ``data/pokemon/foil/`` + keyed ``data/pokemon/cards.json``:

- ``foil/shaders/*.frag`` — GLES3 ``#version 300 es`` fragments (platform 9)
- ``foil/cards.json`` — MaterialManifest rows (raw)
- ``data/pokemon/cards.json`` — keyed dump for store audit / card_foil
- ``cards/{set}/{lang}/{card}/`` — art + masks

    python extract.py --bundles-dir data/pokemon/staging/cdn-bundles
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
_LIB = _SCRIPTS / "lib"
# ``scripts/lib`` before ``scripts/pokemon`` so ``import paths`` is lib/paths,
# not the pokemon shim (PYTHONPATH often pins pokemon first).
for _p in (_LIB, _HERE, _SCRIPTS):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

from paths import (  # noqa: E402
    ensure_effects_layout,
    foil_pack_dir,
    pack_cards_dir,
    pack_data_dir,
    pack_staging_dir,
)
from card_crop import (  # noqa: E402
    UvRect,
    crop_card_image,
    load_uv_rect,
    uv_rect_from_quad,
)
from lib.save_webp import migrate_png_beside, save_lossless_webp, texture_path  # noqa: E402

BUNDLE_STEM_RE = re.compile(
    r"^([a-z0-9.-]+)_([a-z]{2,4})_(\d{3})(?:_[a-z]+)?$", re.I
)


def card_face_dir(cards_root: Path, bundle_name: str) -> Path:
    m = BUNDLE_STEM_RE.match(bundle_name)
    if not m:
        return cards_root / "_unparsed" / bundle_name
    return cards_root / m.group(1).lower() / m.group(2).lower() / m.group(3)


def canonical_face_filename(
    bundle_stem: str,
    tex_name: str,
    *,
    as_art: bool = False,
) -> str:
    """Map a Unity Texture2D name to the on-disk face filename.

    ``bundle_stem`` must be the full Live stem (e.g. ``swsh10_it_008``), not
    the card-number directory basename — otherwise art is misfiled as
    ``extra-<stem>.webp``.

    ``as_art``: MaterialManifest ``_c`` / cardTex (may be a cross-set alt name
    like ``me2-5_fr_153_alt`` on a ``mealt_fr_010`` bundle) — always
    ``art.webp``, matching ``pokemonFaceFileFromTex`` on the TS side.
    """
    base = Path(tex_name).stem.lower()
    stem = bundle_stem.lower()
    if "_etch_" in base:
        return "etch.webp"
    if "_wp_mph_" in base:
        return "mask-mph.webp"
    if "_wp_sph_" in base:
        return "mask-sph.webp"
    if "_wp_ph_" in base:
        return "mask-ph.webp"
    if "_wp_" in base:
        return "mask.webp"
    if as_art or base == stem:
        return "art.webp"
    return f"extra-{Path(tex_name).stem}.webp"


def _texture_key_ci(textures: dict[str, object], name: str) -> str | None:
    """Resolve a Texture2D dict key, case-insensitive."""
    if name in textures:
        return name
    lower = name.lower()
    for key in textures:
        if key.lower() == lower:
            return key
    return None

TPCI_PATH_RE = re.compile(rb"TPCi/Cards3D/(?:HoloFoil|Standard)/([A-Za-z0-9]+)")
BUNDLE_RE = re.compile(
    r"^(?P<set>[a-z0-9.-]+)_(?P<lang>[a-z]{2,4})_(?P<num>\d+)(?P<suf>_[a-z])?$",
    re.IGNORECASE,
)

def _pairs(seq):
    for entry in seq or []:
        if isinstance(entry, (list, tuple)) and len(entry) == 2:
            yield entry[0], entry[1]
        else:
            key = getattr(entry, "first", None) or getattr(entry, "key", None)
            val = getattr(entry, "second", None)
            if val is None:
                val = getattr(entry, "value", None)
            yield key, val


def _discover_shader_names(
    *,
    shaders_dir: Path | None = None,
    repo: Path | None = None,
) -> tuple[str, ...]:
    """Longest-first `.frag` stems from dump (+ NonFoil)."""
    if shaders_dir is None:
        if repo is None:
            repo = Path(__file__).resolve().parents[2]
        shaders_dir = foil_pack_dir(repo, "pokemon") / "shaders"
    stems: list[str] = []
    if shaders_dir is not None and shaders_dir.is_dir():
        stems.extend(p.stem for p in shaders_dir.glob("*.frag"))
        frag_stems = shaders_dir.parent / "frag-stems.json"
        if frag_stems.is_file():
            try:
                data = json.loads(frag_stems.read_text(encoding="utf-8"))
                stems.extend(data.get("stems") or [])
            except Exception:
                pass
    names = sorted(set(stems) | {"NonFoil"}, key=lambda s: (-len(s), s))
    return tuple(names)


def foil_manifest_to_shader(
    foil: str,
    shader_path: str = "",
    *,
    shaders_dir: Path | None = None,
    repo: Path | None = None,
) -> str:
    """Map MaterialManifest `_f` / `_s` → dumped `.frag` stem.

    Mirrors ``foilManifestToShader`` in ``src/effects/pokemon/foilNames.ts``
    (including Live's ``Cracked_Ice`` underscore-inside-CamelCase quirk).
    """
    names = _discover_shader_names(shaders_dir=shaders_dir, repo=repo)
    name_set = set(names)
    for raw in (foil, shader_path):
        n = (raw or "").strip()
        if not n:
            continue
        if n in name_set:
            return n
        n = re.sub(r"^TPCi/Cards3D/(?:HoloFoil|Standard)/", "", n)
        n = re.sub(r"^Cards/(?:Foil|Standard)/", "", n)
        n = re.sub(r"^HoloFoil_", "", n)
        n = re.sub(r"^Standard_", "", n)
        n_lower = n.lower()
        n_compact = n_lower.replace("_", "")
        for name in names:
            name_lower = name.lower()
            if (
                n_lower == name_lower
                or n_lower.startswith(f"{name_lower}_")
                or n_compact == name_lower
                or n_compact.startswith(name_lower)
            ):
                return name
        if re.search(r"nonfoil", n, re.I):
            return "NonFoil"
    return ""


def canonical_mask_tex_name(name: str) -> str:
    """Fix Live's rare ``set_pcd_wp_…`` typo → ``set_wp_pcd_…``."""
    return re.sub(r"_pcd_wp_", "_wp_pcd_", (name or "").strip())


def reconcile_mask_tex(mask_tex: str, available: set[str]) -> str:
    """Keep a texture ref only when the Texture2D actually ships in the bundle.

    Live occasionally references a whiteplate it forgot to pack (e.g.
    ``smalt_de_005`` → ``sm1_pcd_wp_de_011`` with no Texture2D, confirmed on
    Android / iOS / StandaloneOSX / Win64 CDN). The client falls back to
    ``NullWhitePlateTexture``; Placarr mirrors that with an empty ``maskTex``
    → ``full_foil_mask``. A dangling name fails store audit.
    """
    m = (mask_tex or "").strip()
    if not m:
        return ""
    if m in available:
        return m
    alt = canonical_mask_tex_name(m)
    if alt != m and alt in available:
        return alt
    rev = re.sub(r"_wp_pcd_", "_pcd_wp_", m)
    if rev != m and rev in available:
        return rev
    return ""


def build_keyed_cards(
    rows: list[dict],
    *,
    shaders_dir: Path | None = None,
    repo: Path | None = None,
) -> dict[str, dict]:
    """Bundle id → {std|ph: {foil, shader, cardTex, maskTex[, etchTex, coldFoilTex]}}."""
    out: dict[str, dict] = {}
    for row in rows:
        bid = str(row.get("bundle") or "").strip()
        variant = str(row.get("variant") or "std").strip()
        if not bid or variant not in ("std", "ph"):
            continue
        foil = str(row.get("foil") or "")
        shader_path = str(row.get("shaderPath") or "")
        shader = foil_manifest_to_shader(
            foil, shader_path, shaders_dir=shaders_dir, repo=repo
        )
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


def write_runtime_cards(
    repo: Path,
    rows: list[dict],
    *,
    shaders_dir: Path | None = None,
) -> Path:
    """Keyed dump consumed by store audit + ``indexCardFoil`` (SQLite)."""
    path = pack_data_dir(repo, "pokemon") / "cards.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    keyed = build_keyed_cards(rows, shaders_dir=shaders_dir, repo=repo)
    path.write_text(
        json.dumps(keyed, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return path


def _bake_luma_to_alpha_webp(path: Path) -> None:
    """Put RGB luminance into alpha so CSS `mask-mode: alpha` can carve.

    Live ships some stencil plates as RGB (shape in luma, opaque alpha). Keep
    RGB intact for GLES `.x`/`.y` samples; only extend alpha for CSS carve.
    """
    from PIL import Image
    import numpy as np

    im = Image.open(path).convert("RGB")
    r, g, b = im.split()
    luma = np.array(im.convert("L"), dtype=np.float32)
    # Sparse Northern Cross: lift mid tones so stars form a readable mask.
    alpha = np.clip((luma - 8.0) * (255.0 / 120.0), 0, 255).astype(np.uint8)
    out = Image.merge("RGBA", (r, g, b, Image.fromarray(alpha, "L")))
    save_lossless_webp(out, path)


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
    tex_dir = shaders_dir.parent / "textures"
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
            # CSS carve uses mask-mode:alpha; Northern Cross ships RGB-only
            # (shape in luma). Bake luma→alpha so CastAndCure stars cut.
            if name == "FX_T_Northern_Cross":
                _bake_luma_to_alpha_webp(dest)
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
    textures_by_path: dict[int, str] = {}
    for obj in env.objects:
        if obj.type != ClassIDType.Texture2D:
            continue
        data = obj.read()
        tex_name = str(data.m_Name or "").strip()
        if tex_name:
            textures_by_path[obj.path_id] = tex_name

    sheets: dict[str, dict] = {}
    motifs: dict[str, dict[str, str]] = {}
    for obj in env.objects:
        if obj.type != ClassIDType.Material:
            continue
        m = obj.read()
        name = str(m.m_Name or "")
        if not name.startswith("MAT_Cards3D_"):
            continue
        leaf = name.removeprefix("MAT_Cards3D_")
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
        sheets[leaf] = {
            "floats": floats,
            "colors": colors,
        }
        leaf_motifs: dict[str, str] = {}
        for key, tex_env in _pairs(props.m_TexEnvs):
            uniform = str(key)
            tptr = tex_env.m_Texture
            tpid = getattr(tptr, "m_PathID", None) or getattr(tptr, "path_id", None)
            if not tpid:
                continue
            tex_stem = textures_by_path.get(tpid)
            if not tex_stem:
                continue
            leaf_motifs[uniform] = tex_stem
        if leaf_motifs:
            motifs[leaf] = leaf_motifs

    out_dir = foil_pack_dir(repo, "pokemon")
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "materialSheets.json"
    path.write_text(
        json.dumps(sheets, indent=1, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    (out_dir / "shared-motifs.json").write_text(
        json.dumps(motifs, indent=1, sort_keys=True) + "\n",
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

    # One Texture2D read per object (name + optional dump). Double-read used to
    # decode every image twice across ~90k bundles.
    textures: dict[str, object] = {}
    for obj in env.objects:
        if obj.type != ClassIDType.Texture2D:
            continue
        data = obj.read()
        name = data.m_Name or f"tex_{obj.path_id}"
        textures[name] = data

    texture_names = set(textures)
    # Drop / rename refs Live forgot to pack (store audit hard-fails on dangling
    # names). Same for etch / cold-foil — client has NullEtchTexture etc.
    # Even in ``none`` mode so cards.json stays honest.
    for row in rows:
        row["maskTex"] = reconcile_mask_tex(
            str(row.get("maskTex") or ""),
            texture_names,
        )
        for key in ("etch", "coldFoil"):
            row[key] = reconcile_mask_tex(str(row.get(key) or ""), texture_names)

    if texture_mode == "none":
        return rows

    # Full Live stem (``swsh10_it_008``), not ``textures_dir.name`` (``008``).
    bundle_stem = path.name
    art_texes: set[str] = set()
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
                if not value:
                    continue
                wanted.add(value)
                resolved = _texture_key_ci(textures, value)
                if resolved:
                    wanted.add(resolved)
                alt = canonical_mask_tex_name(value)
                if alt != value:
                    wanted.add(alt)
                    alt_resolved = _texture_key_ci(textures, alt)
                    if alt_resolved:
                        wanted.add(alt_resolved)
                if texture_mode == "cards" and key == "cardTex":
                    art_texes.add(value.lower())
                    if resolved:
                        art_texes.add(resolved.lower())
        # Promo / BSP orphans: CDN ships a stem Texture2D but no MaterialManifest.
        # Never drop the card — dump that face as art.webp.
        if texture_mode == "cards" and not wanted:
            stem_key = _texture_key_ci(textures, bundle_stem)
            if stem_key is not None:
                wanted.add(stem_key)
                art_texes.add(stem_key.lower())
            elif len(textures) == 1:
                only = next(iter(textures))
                wanted.add(only)
                art_texes.add(only.lower())
            else:
                return rows

    textures_dir.mkdir(parents=True, exist_ok=True)
    for name, data in textures.items():
        if wanted is not None and name not in wanted:
            continue
        dest = textures_dir / canonical_face_filename(
            bundle_stem,
            name,
            as_art=name.lower() in art_texes,
        )
        if migrate_png_beside(dest):
            continue
        try:
            # Card-slot textures ship packed square — crop to the mesh rect so
            # the file itself has card proportions (see `card_crop`).
            save_lossless_webp(crop_card_image(data.image, crop_rect), dest)
        except Exception as err:
            print(f"  FAIL write {dest.name}: {err}", flush=True)
            try:
                if dest.is_file() and dest.stat().st_size == 0:
                    dest.unlink()
            except OSError:
                pass
    return rows


EXTRACT_SIDECAR = ".extract-manifest.json"


def _bundle_mtime(bundle: Path) -> float:
    return bundle.stat().st_mtime


def _read_extract_sidecar(
    face_dir: Path, bundle_mtime: float, texture_mode: str
) -> list[dict] | None:
    sidecar = face_dir / EXTRACT_SIDECAR
    if not sidecar.is_file():
        return None
    try:
        meta = json.loads(sidecar.read_text(encoding="utf-8"))
    except Exception:
        return None
    if meta.get("bundleMtime") != bundle_mtime:
        return None
    if meta.get("textureMode") != texture_mode:
        return None
    rows = meta.get("rows")
    return rows if isinstance(rows, list) else None


def _write_extract_sidecar(
    face_dir: Path, bundle_mtime: float, texture_mode: str, rows: list[dict]
) -> None:
    face_dir.mkdir(parents=True, exist_ok=True)
    sidecar = face_dir / EXTRACT_SIDECAR
    sidecar.write_text(
        json.dumps(
            {"bundleMtime": bundle_mtime, "textureMode": texture_mode, "rows": rows},
            indent=0,
        )
        + "\n",
        encoding="utf-8",
    )


def _textures_fresh(bundle: Path, face_dir: Path, texture_mode: str) -> bool:
    if texture_mode not in ("cards", "masks", "all"):
        return False
    art = face_dir / "art.webp"
    if not art.is_file():
        return False
    return _bundle_mtime(bundle) <= art.stat().st_mtime


def resolve_card_extract(
    bundle: Path,
    face_dir: Path,
    *,
    texture_mode: str,
    crop_rect: UvRect | None,
) -> tuple[list[dict], bool]:
    """Return manifest rows and whether the bundle was fully skipped."""
    b_mtime = _bundle_mtime(bundle)
    cached = _read_extract_sidecar(face_dir, b_mtime, texture_mode)
    # Missing art.webp is never "done" in cards mode — recover no-manifest /
    # cross-stem dumps. Never delete the card dir; re-extract until art lands.
    art_ok = (face_dir / "art.webp").is_file() and (face_dir / "art.webp").stat().st_size > 0
    if cached is not None and not (texture_mode == "cards" and not art_ok):
        return cached, True
    effective_mode = (
        "none" if _textures_fresh(bundle, face_dir, texture_mode) else texture_mode
    )
    rows = extract_card_bundle(
        bundle,
        face_dir,
        texture_mode=effective_mode,
        crop_rect=crop_rect,
    )
    _write_extract_sidecar(face_dir, b_mtime, texture_mode, rows)
    return rows, False


def _extract_one_card(
    payload: tuple[str, str, str, UvRect | None],
) -> tuple[list[dict], str | None, bool]:
    """Worker entry: ``(bundle_path, card_dir, texture_mode, crop_rect)``."""
    path_s, card_dir, texture_mode, crop_rect = payload
    path = Path(path_s)
    face_dir = Path(card_dir)
    try:
        rows, skipped = resolve_card_extract(
            path,
            face_dir,
            texture_mode=texture_mode,
            crop_rect=crop_rect,
        )
        return rows, None, skipped
    except Exception as err:
        return [], f"{path.name}: {err}", False


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
    cards_root = (
        pack_cards_dir(repo, "pokemon")
        if repo is not None
        else pack_dir.parent / "cards"
    )
    cards: list[dict] = []

    # Repair leftovers from the ``textures_dir.name`` stem bug before workers
    # touch disk (admin Extract runs this path only — no separate CLI needed).
    if texture_mode != "none":
        early = cleanup_misfiled_face_textures(cards_root)
        if any(early.values()):
            print(
                "  face cleanup:"
                f" removedDupExtras={early['removedDupExtras']}"
                f" promotedExtrasToArt={early['promotedExtrasToArt']}"
                f" removedEmpty={early['removedEmpty']}",
                flush=True,
            )

    card_quad: dict | None = None
    crop_rect: UvRect | None = None
    if repo is not None:
        print("  extract: card UV rect + back (APK)", flush=True)
        from card_back import dump_pokemon_card_back
        from card_quad import dump_pokemon_card_quad

        # The crop the app applies to every square card-slot texture. Lives in
        # the mesh UVs, not in any material — see `card_quad`. Dumped first:
        # the card back and every card texture below are cropped through it.
        card_quad = dump_pokemon_card_quad(repo, pack_dir / "card-uv-rect.json")
        crop_rect = uv_rect_from_quad(card_quad) or load_uv_rect(pack_dir)
        dump_pokemon_card_back(repo, pack_dir, crop_rect=crop_rect)

    sh = bundles_dir / "shadersbundle"
    shader_report: dict = {}
    if sh.is_file():
        print(f"  extract: shadersbundle ({sh.stat().st_size // 1024} KiB)", flush=True)
        shader_report = extract_shadersbundle(sh, shaders_dir)
        write_material_sheets(repo, sh)
        written = shader_report.get("shadersWritten") or []
        if written:
            stems = sorted(
                {Path(n).stem for n in written},
                key=lambda s: (-len(s), s),
            )
            (pack_dir / "frag-stems.json").write_text(
                json.dumps({"stems": stems}, indent=2) + "\n",
                encoding="utf-8",
            )
        # Per-texture colour space — the renderer needs it to sample shared
        # motifs the way the app's Linear pipeline does.
        tex_flags = shader_report.pop("textureFlags", {})
        if repo is not None and tex_flags:
            flags_path = foil_pack_dir(repo, "pokemon") / "textureFlags.json"
            flags_path.parent.mkdir(parents=True, exist_ok=True)
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
    skipped = 0
    n_workers = max(1, int(workers))
    print(
        f"  cards extract mode={texture_mode} workers={n_workers} "
        f"bundles={len(card_files)}",
        flush=True,
    )

    if n_workers == 1:
        for i, path in enumerate(card_files, 1):
            try:
                rows, was_skipped = resolve_card_extract(
                    path,
                    card_face_dir(cards_root, path.name),
                    texture_mode=texture_mode,
                    crop_rect=crop_rect,
                )
                if was_skipped:
                    skipped += 1
                cards.extend(rows)
            except Exception as err:
                errors += 1
                if errors <= 10:
                    print(f"  FAIL {path.name}: {err}", flush=True)
            if i % 200 == 0 or i == len(card_files):
                print(
                    f"  cards {i}/{len(card_files)} manifests={len(cards)}"
                    f" skipped={skipped}",
                    flush=True,
                )
    else:
        payloads = [
            (str(p), str(card_face_dir(cards_root, p.name)), texture_mode, crop_rect)
            for p in card_files
        ]
        done = 0
        with ProcessPoolExecutor(max_workers=n_workers) as pool:
            futures = [pool.submit(_extract_one_card, p) for p in payloads]
            for fut in as_completed(futures):
                rows, err, was_skipped = fut.result()
                done += 1
                if err:
                    errors += 1
                    if errors <= 10:
                        print(f"  FAIL {err}", flush=True)
                else:
                    if was_skipped:
                        skipped += 1
                    cards.extend(rows)
                if done % 200 == 0 or done == len(card_files):
                    print(
                        f"  cards {done}/{len(card_files)} manifests={len(cards)}"
                        f" skipped={skipped}",
                        flush=True,
                    )

    cards_path = pack_dir / "cards.json"
    cards_path.write_text(
        json.dumps({"cards": cards, "count": len(cards)}, indent=2) + "\n",
        encoding="utf-8",
    )
    runtime_cards: str | None = None
    if repo is not None:
        runtime_cards = str(
            write_runtime_cards(repo, cards, shaders_dir=shaders_dir)
        )
        print(
            f"  runtime cards → {runtime_cards} "
            f"({len(build_keyed_cards(cards, shaders_dir=shaders_dir, repo=repo))} bundles)",
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
        "cardBundlesSkipped": skipped,
        "manifestRows": len(cards),
        "keyedBundles": len(
            build_keyed_cards(cards, shaders_dir=shaders_dir, repo=repo)
        ),
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

def _crop_bundle_dir(payload: tuple[str, UvRect]) -> tuple[int, list[str]]:
    """Worker: crop every still-square webp of one bundle dir in place.

    Errors are collected per-file — one corrupt ``extra-*.webp`` must not abort
    the rest of the card dir (and must not fail the whole extract job).
    """
    from PIL import Image

    dir_s, rect = payload
    cropped = 0
    errors: list[str] = []
    for path in Path(dir_s).glob("*.webp"):
        try:
            if path.stat().st_size == 0:
                path.unlink(missing_ok=True)
                errors.append(f"{path}: empty (removed)")
                continue
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
            errors.append(f"{path}: {err}")
    return cropped, errors


def cleanup_misfiled_face_textures(cards_root: Path) -> dict:
    """Repair the ``textures_dir.name`` stem bug leftovers.

    When extract passed the card-number directory basename (``008``) instead of
    the Live stem (``swsh10_it_008``), art was written as
    ``extra-{set}_{lang}_{card}.webp``. Promote that file to ``art.webp`` when
    art is missing; delete the duplicate when art already exists. Also drop
    empty ``.webp`` files that block future dumps.

    Never deletes a card directory — only repairs files inside it.
    """
    removed_dup = 0
    promoted = 0
    removed_empty = 0
    if not cards_root.is_dir():
        return {
            "removedDupExtras": 0,
            "promotedExtrasToArt": 0,
            "removedEmpty": 0,
        }

    for set_dir in cards_root.iterdir():
        if not set_dir.is_dir() or set_dir.name.startswith("."):
            continue
        if set_dir.name in ("_unparsed",):
            continue
        for lang_dir in set_dir.iterdir():
            if not lang_dir.is_dir():
                continue
            for card_dir in lang_dir.iterdir():
                if not card_dir.is_dir():
                    continue
                stem = f"{set_dir.name}_{lang_dir.name}_{card_dir.name}".lower()
                art = card_dir / "art.webp"
                art_ok = art.is_file() and art.stat().st_size > 0
                bogus = card_dir / f"extra-{stem}.webp"
                if bogus.is_file():
                    bogus_ok = bogus.stat().st_size > 0
                    if not art_ok and bogus_ok:
                        try:
                            if art.is_file():
                                art.unlink()
                            bogus.replace(art)
                            promoted += 1
                            art_ok = True
                        except OSError as err:
                            print(f"  FAIL promote {bogus}: {err}", flush=True)
                    else:
                        try:
                            bogus.unlink()
                            removed_dup += 1
                        except OSError as err:
                            print(f"  FAIL unlink {bogus}: {err}", flush=True)
                # Cross-stem cardTex leftovers (e.g. mealt → extra-me2-5_*_alt.webp):
                # promote the sole non-empty extra when art is still missing.
                if not art_ok:
                    extras = [
                        p
                        for p in card_dir.glob("extra-*.webp")
                        if p.is_file() and p.stat().st_size > 0
                    ]
                    if len(extras) == 1:
                        try:
                            if art.is_file():
                                art.unlink()
                            extras[0].replace(art)
                            promoted += 1
                            art_ok = True
                        except OSError as err:
                            print(f"  FAIL promote {extras[0]}: {err}", flush=True)
                for webp in card_dir.glob("*.webp"):
                    try:
                        if webp.stat().st_size == 0:
                            webp.unlink()
                            removed_empty += 1
                    except OSError:
                        pass

    return {
        "removedDupExtras": removed_dup,
        "promotedExtrasToArt": promoted,
        "removedEmpty": removed_empty,
    }


def crop_existing_textures(pack_dir: Path, *, workers: int = 1) -> dict:
    """One-shot: crop already-dumped textures (and the card back) in place.

    Shared FX motifs tile the whole card and are not packed — skipped.
    """
    rect = load_uv_rect(pack_dir)
    if rect is None:
        raise SystemExit(f"missing {pack_dir / 'card-uv-rect.json'} — run a dump first")

    from concurrent.futures import ProcessPoolExecutor, as_completed

    cards_root = pack_dir.parent / "cards"
    cleanup = cleanup_misfiled_face_textures(cards_root)
    if any(cleanup.values()):
        print(
            "  face cleanup:"
            f" removedDupExtras={cleanup['removedDupExtras']}"
            f" promotedExtrasToArt={cleanup['promotedExtrasToArt']}"
            f" removedEmpty={cleanup['removedEmpty']}",
            flush=True,
        )

    bundle_dirs: list[Path] = []
    if cards_root.is_dir():
        for set_dir in cards_root.iterdir():
            if not set_dir.is_dir():
                continue
            for lang_dir in set_dir.iterdir():
                if not lang_dir.is_dir():
                    continue
                for card_dir in lang_dir.iterdir():
                    if card_dir.is_dir():
                        bundle_dirs.append(card_dir)
    bundle_dirs.sort()
    print(
        f"  crop existing: {len(bundle_dirs)} card dirs, workers={workers}",
        flush=True,
    )

    cropped = 0
    errors = 0
    error_samples: list[str] = []
    done = 0
    n_workers = max(1, int(workers))
    if n_workers == 1:
        results = (_crop_bundle_dir((str(p), rect)) for p in bundle_dirs)
        iterator = results
        pool = None
    else:
        pool = ProcessPoolExecutor(max_workers=n_workers)
        futures = [
            pool.submit(_crop_bundle_dir, (str(p), rect)) for p in bundle_dirs
        ]
        iterator = (fut.result() for fut in as_completed(futures))
    try:
        for n, errs in iterator:
            cropped += n
            done += 1
            if errs:
                errors += len(errs)
                for msg in errs:
                    if len(error_samples) < 10:
                        error_samples.append(msg)
                        print(f"  FAIL {msg}", flush=True)
            if done % 500 == 0 or done == len(bundle_dirs):
                print(
                    f"  crop {done}/{len(bundle_dirs)} files={cropped} errors={errors}",
                    flush=True,
                )
    finally:
        if pool is not None:
            pool.shutdown(wait=True)

    # Card back lives beside foil/, not under cards/{set}/…
    back = cards_root / "back.webp"
    if back.is_file() and back.stat().st_size > 0:
        from PIL import Image

        try:
            with Image.open(back) as img:
                if img.width == img.height:
                    img.load()
                    out = crop_card_image(img, rect)
                    if out is not img:
                        save_lossless_webp(out, back)
                        cropped += 1
        except Exception as err:
            errors += 1
            error_samples.append(f"{back}: {err}")
            print(f"  FAIL {back}: {err}", flush=True)

    return {
        "bundleDirs": len(bundle_dirs),
        "cropped": cropped,
        "errors": errors,
        "errorSamples": error_samples,
        "cleanup": cleanup,
    }



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
    ap.add_argument(
        "--cleanup-faces",
        action="store_true",
        help="One-shot: remove misfiled extra-{stem}.webp duplicates / empty webps",
    )
    args = ap.parse_args(argv)
    repo = args.repo.resolve()
    ensure_effects_layout(repo)
    bundles = (
        Path(args.bundles_dir).resolve()
        if args.bundles_dir
        else pack_staging_dir(repo, "pokemon") / "cdn-bundles"
    )
    pack = (
        Path(args.pack_dir).resolve()
        if args.pack_dir
        else foil_pack_dir(repo, "pokemon")
    )
    if args.cleanup_faces:
        cards_root = pack_cards_dir(repo, "pokemon")
        report = cleanup_misfiled_face_textures(cards_root)
        print(json.dumps(report, indent=2))
        return 0
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
