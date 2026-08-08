"""Extract card-effect assets from a Unity TCG app data bundle.

Three phases:

1. **shaders** — WebGL2-ready fragments under ``public/foil/<pack>/shaders/``.
2. **materials** — binding table at ``src/effects/<pack>/manifest.json``.
3. **textures** — lossless WebP (+ best-effort raw ASTC) under ``data/<pack>/foil/textures/``.

Also exports pack card backs (e.g. ``card_back`` sprite) to ``data/<pack>/foil/card_back.webp``.

Usage:
    python dump_unity.py --pack lorcana --data <apk>/assets/bin/Data --repo <repo root>

Requires: UnityPy, lz4, Pillow (see requirements.txt).
"""

from __future__ import annotations

import argparse
import json
import re
import struct
import sys
from pathlib import Path

import lz4.block
import UnityPy

_SCRIPTS = Path(__file__).resolve().parents[1]
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from lib.save_webp import migrate_png_beside, save_lossless_webp, texture_path  # noqa: E402

CARD_EFFECT_KEYS = ("Foil", "Varnish", "Holo")

SCROLL_TILT = "_SCROLLMODE_TILT"
SCROLL_TIME = "_SCROLLMODE_TIME"

RUNTIME_ROLES = {
    "_Motif": "art",
    "_MotifMask": "foilMask",
    "_TopLayerMask": "varnishMask",
    "_SecondTopLayerMask": "secondVarnishMask",
    "_NormalMap": "normals",
}

PACK_CARD_BACKS: dict[str, tuple[str, ...]] = {
    "lorcana": ("card_back",),
}

# Unity TextureFormat ASTC_* (48+) → WebGL2 enum name and block size in texels.
UNITY_ASTC_INT: dict[int, tuple[str, int]] = {
    48: ("COMPRESSED_RGBA_ASTC_4x4_KHR", 4),
    49: ("COMPRESSED_RGBA_ASTC_5x5_KHR", 5),
    50: ("COMPRESSED_RGBA_ASTC_6x6_KHR", 6),
    51: ("COMPRESSED_RGBA_ASTC_8x8_KHR", 8),
    52: ("COMPRESSED_RGBA_ASTC_10x10_KHR", 10),
    53: ("COMPRESSED_RGBA_ASTC_12x12_KHR", 12),
}

ASTC_NAME_PATTERNS: list[tuple[str, str, int]] = [
    ("ASTC_12X12", "COMPRESSED_RGBA_ASTC_12x12_KHR", 12),
    ("ASTC_10X10", "COMPRESSED_RGBA_ASTC_10x10_KHR", 10),
    ("ASTC_8X8", "COMPRESSED_RGBA_ASTC_8x8_KHR", 8),
    ("ASTC_6X6", "COMPRESSED_RGBA_ASTC_6x6_KHR", 6),
    ("ASTC_5X5", "COMPRESSED_RGBA_ASTC_5x5_KHR", 5),
    ("ASTC_4X4", "COMPRESSED_RGBA_ASTC_4x4_KHR", 4),
    ("ASTC_RGBA_12X12", "COMPRESSED_RGBA_ASTC_12x12_KHR", 12),
    ("ASTC_RGBA_10X10", "COMPRESSED_RGBA_ASTC_10x10_KHR", 10),
    ("ASTC_RGBA_8X8", "COMPRESSED_RGBA_ASTC_8x8_KHR", 8),
    ("ASTC_RGBA_6X6", "COMPRESSED_RGBA_ASTC_6x6_KHR", 6),
    ("ASTC_RGBA_5X5", "COMPRESSED_RGBA_ASTC_5x5_KHR", 5),
    ("ASTC_RGBA_4X4", "COMPRESSED_RGBA_ASTC_4x4_KHR", 4),
]


def flat(x):
    out = []
    for v in x:
        if isinstance(v, (list, tuple)):
            out.extend(v)
        else:
            out.append(v)
    return out


def pairs(seq):
    for entry in seq or []:
        if isinstance(entry, (list, tuple)) and len(entry) == 2:
            yield entry[0], entry[1]
        else:
            key = getattr(entry, "first", None) or getattr(entry, "key", None)
            val = getattr(entry, "second", None)
            if val is None:
                val = getattr(entry, "value", None)
            yield key, val


def is_card_effect(name: str) -> bool:
    return any(k in name for k in CARD_EFFECT_KEYS)


def resolve_data_file(data_dir: Path) -> Path:
    for name in ("data.unity3d", "datapack.unity3d"):
        candidate = data_dir / name
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(
        f"Aucun data.unity3d ni datapack.unity3d dans {data_dir}"
    )


def astc_webgl_and_block(tex) -> tuple[str, int] | None:
    fmt = tex.m_TextureFormat
    try:
        ival = int(fmt)
    except (TypeError, ValueError):
        ival = None
    if ival is not None and ival in UNITY_ASTC_INT:
        return UNITY_ASTC_INT[ival]
    name = getattr(fmt, "name", str(fmt)).upper().replace("-", "_")
    if "ASTC" not in name:
        return None
    for needle, webgl, block in ASTC_NAME_PATTERNS:
        if needle in name:
            return webgl, block
    return None


def is_astc_texture(tex) -> bool:
    return astc_webgl_and_block(tex) is not None


def astc_level0_byte_count(width: int, height: int, block: int) -> int:
    bw = (width + block - 1) // block
    bh = (height + block - 1) // block
    return bw * bh * 16


def extract_astc_level0(tex) -> bytes | None:
    info = astc_webgl_and_block(tex)
    if info is None:
        return None
    raw_fn = getattr(tex, "get_image_data", None)
    if not callable(raw_fn):
        return None
    try:
        data = raw_fn()
    except Exception:
        data = getattr(tex, "image_data", None)
    if not data:
        return None
    _, block = info
    w, h = int(tex.m_Width), int(tex.m_Height)
    expected = astc_level0_byte_count(w, h, block)
    if len(data) < expected:
        return None
    return bytes(data[:expected])


def decompress_blob(shader) -> bytes:
    blob = bytes(shader.compressedBlob)
    off = flat(shader.offsets)[0]
    clen = flat(shader.compressedLengths)[0]
    dlen = flat(shader.decompressedLengths)[0]
    chunk = blob[off : off + clen]
    if clen == dlen:
        return chunk
    return lz4.block.decompress(chunk, uncompressed_size=dlen)


def blob_entry_glsl(data: bytes, i: int) -> str | None:
    eoff, elen, _seg = struct.unpack_from("<iii", data, 4 + i * 12)
    start = data.find(b"#version", eoff, eoff + elen)
    if start == -1:
        return None
    end = data.find(b"\x00", start, eoff + elen)
    if end == -1:
        end = eoff + elen
    return data[start:end].decode("utf-8", errors="replace")


def variant_map(parsed_form) -> dict[int, list[str]]:
    kw_names = list(parsed_form.m_KeywordNames)
    mapping: dict[int, list[str]] = {}
    for sub in parsed_form.m_SubShaders:
        for pas in sub.m_Passes:
            for kind in ("progVertex", "progFragment"):
                prog = getattr(pas, kind, None)
                if prog is None:
                    continue
                for tier in (prog.m_PlayerSubPrograms or [])[:1]:
                    items = tier if isinstance(tier, list) else [tier]
                    for p in items:
                        kws = sorted(
                            kw_names[k] for k in (p.m_KeywordIndices or [])
                        )
                        mapping.setdefault(p.m_BlobIndex, kws)
    return mapping


def to_webgl2_fragment(src: str) -> str:
    i = src.find("#ifdef FRAGMENT")
    frag = src[i + len("#ifdef FRAGMENT") :]
    frag = frag[: frag.rfind("#endif")].lstrip("\n")
    frag = frag.replace(
        "#define HLSLCC_ENABLE_UNIFORM_BUFFERS 1",
        "#define HLSLCC_ENABLE_UNIFORM_BUFFERS 0",
    )
    frag = frag.replace(
        "#define UNITY_SUPPORTS_UNIFORM_LOCATION 1",
        "#define UNITY_SUPPORTS_UNIFORM_LOCATION 0",
    )
    return frag


def variant_key(keywords: list[str]) -> str:
    return "__".join(
        sorted(
            k
            for k in keywords
            if not k.startswith("_SCROLLMODE")
            and not k.startswith(("UNITY_", "STEREO"))
        )
    )


def dump_shaders(
    env, shaders_dir: Path
) -> tuple[dict[str, dict[str, str]], dict[str, dict[str, str]]]:
    shaders_dir.mkdir(parents=True, exist_ok=True)
    tilt_graphs: dict[str, dict[str, str]] = {}
    time_graphs: dict[str, dict[str, str]] = {}
    for obj in env.objects:
        if obj.type.name != "Shader":
            continue
        s = obj.read()
        pf = s.m_ParsedForm
        graph = str(pf.m_Name)
        if not is_card_effect(graph) or not graph.startswith("Shader Graphs/"):
            continue
        data = decompress_blob(s)
        tilt_variants: dict[str, str] = {}
        time_variants: dict[str, str] = {}
        leaf = graph.split("/")[-1]
        for blob_index, keywords in sorted(variant_map(pf).items()):
            if any(k.startswith(("UNITY_UI_", "STEREO")) for k in keywords):
                continue
            if SCROLL_TILT in keywords:
                bucket = tilt_variants
                time_suffix = False
            elif SCROLL_TIME in keywords:
                bucket = time_variants
                time_suffix = True
            else:
                continue
            glsl = blob_entry_glsl(data, blob_index)
            if glsl is None:
                continue
            key = variant_key(keywords)
            file_name = leaf + (f"__{key}" if key else "")
            if time_suffix:
                file_name += f"__{SCROLL_TIME}"
            file_name += ".frag"
            (shaders_dir / file_name).write_text(to_webgl2_fragment(glsl))
            bucket[key] = file_name
        tilt_graphs[graph] = tilt_variants
        time_graphs[graph] = time_variants
        print(
            f"  {graph}: {len(tilt_variants)} Tilt, {len(time_variants)} Time"
        )
    return tilt_graphs, time_graphs


UNIFORM_RE = re.compile(
    r"(?:UNITY_UNIFORM|uniform)\s+(?:mediump\s+|highp\s+|lowp\s+)?"
    r"(?:vec[234]|float|int|sampler2D)\s+(_\w+)\s*;"
)

WRAP_MODE = {0: "repeat", 1: "clamp", 2: "mirror", 3: "mirrorOnce"}
FILTER_MODE = {0: "point", 1: "bilinear", 2: "trilinear"}


def fragment_uniforms(frag_src: str) -> set[str]:
    return {
        n
        for n in UNIFORM_RE.findall(frag_src)
        if not n.startswith("Xhlslcc_UnusedX")
    }


def resolve_variant(
    variants: dict[str, str], keywords: list[str]
) -> str | None:
    key = variant_key(keywords)
    if key in variants:
        return variants[key]
    wanted = set(key.split("__")) if key else set()
    candidates = [
        (len(have), file)
        for have_key, file in variants.items()
        for have in [set(have_key.split("__")) if have_key else set()]
        if wanted <= have
    ]
    if not candidates:
        return None
    return min(candidates)[1]


def texture_settings(tex) -> dict:
    ts = tex.m_TextureSettings
    return {
        "wrap": WRAP_MODE.get(int(ts.m_WrapU or 0), "repeat"),
        "filter": FILTER_MODE.get(int(ts.m_FilterMode or 1), "bilinear"),
        "mipmaps": int(tex.m_MipCount or 1) > 1,
        "aniso": int(ts.m_Aniso or 1),
    }


def dump_materials(
    env,
    tilt_graphs: dict[str, dict[str, str]],
    time_graphs: dict[str, dict[str, str]],
    shaders_dir: Path,
    manifest_path: Path,
) -> set[str]:
    textures_by_path: dict[int, str] = {}
    texture_settings_by_name: dict[str, dict] = {}
    shaders_by_path: dict[int, str] = {}
    for obj in env.objects:
        if obj.type.name == "Texture2D":
            try:
                tex = obj.read()
                textures_by_path[obj.path_id] = tex.m_Name
                texture_settings_by_name[tex.m_Name] = texture_settings(tex)
            except Exception:
                pass
        elif obj.type.name == "Shader":
            try:
                shaders_by_path[obj.path_id] = str(obj.read().m_ParsedForm.m_Name)
            except Exception:
                pass

    manifest: dict[str, dict] = {}
    bundle_textures: set[str] = set()

    for obj in env.objects:
        if obj.type.name != "Material":
            continue
        m = obj.read()
        name = m.m_Name
        ptr = m.m_Shader
        pid = getattr(ptr, "m_PathID", None) or getattr(ptr, "path_id", None)
        graph = shaders_by_path.get(pid, "")
        if graph not in tilt_graphs:
            continue

        keywords = list(m.m_ValidKeywords or [])
        fragment = resolve_variant(tilt_graphs[graph], keywords)
        if fragment is None:
            print(
                f"  ATTENTION {name}: pas de variante Tilt pour "
                f"[{variant_key(keywords)}] — matériau ignoré"
            )
            continue
        fragment_time = resolve_variant(time_graphs.get(graph, {}), keywords)
        if fragment_time is None:
            print(
                f"  ATTENTION {name}: pas de variante Time pour "
                f"[{variant_key(keywords)}] — idle Time indisponible"
            )

        used = fragment_uniforms((shaders_dir / fragment).read_text())
        if fragment_time:
            used |= fragment_uniforms((shaders_dir / fragment_time).read_text())

        # HotFoil prints may upgrade to USESECONDTOPLAYER at runtime — keep the
        # sibling's DistortionTex / SecondTopLayer slots in the material table.
        for base_frag in (fragment, fragment_time):
            if not base_frag or "___VARNISHTYPE_" not in base_frag:
                continue
            if "USESECONDTOPLAYER" in base_frag:
                continue
            sibling = base_frag.replace(
                "___VARNISHTYPE_",
                "___USESECONDTOPLAYER___VARNISHTYPE_",
            )
            sibling_path = shaders_dir / sibling
            if sibling_path.is_file():
                used |= fragment_uniforms(sibling_path.read_text())

        entry: dict = {
            "graph": graph,
            "keywords": keywords,
            "fragment": fragment,
            "textures": {},
            "floats": {},
            "colors": {},
        }
        if fragment_time:
            entry["fragmentTime"] = fragment_time
        saved = m.m_SavedProperties
        for key, tex_env in pairs(saved.m_TexEnvs):
            key = str(key)
            if key not in used:
                continue
            tptr = tex_env.m_Texture
            tpid = getattr(tptr, "m_PathID", None) or getattr(tptr, "path_id", None)
            tex_name = textures_by_path.get(tpid)
            if key in RUNTIME_ROLES:
                entry["textures"][key] = {"role": RUNTIME_ROLES[key]}
            elif tex_name:
                binding: dict = {"file": f"{tex_name.lower()}.webp"}
                binding.update(texture_settings_by_name.get(tex_name, {}))
                entry["textures"][key] = binding
                bundle_textures.add(tex_name)
            else:
                print(f"  ATTENTION {name}: slot {key} sans texture")
        for key, value in pairs(saved.m_Floats):
            if str(key) in used:
                entry["floats"][str(key)] = round(float(value), 6)
        for key, c in pairs(saved.m_Colors):
            if str(key) in used:
                entry["colors"][str(key)] = [
                    round(c.r, 6),
                    round(c.g, 6),
                    round(c.b, 6),
                    round(c.a, 6),
                ]
        manifest[name] = entry
        print(
            f"  {name}: {len(entry['textures'])} textures, "
            f"{len(entry['floats'])} floats, {len(entry['colors'])} couleurs"
            + (f", Time={fragment_time}" if fragment_time else "")
        )

    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n"
    )
    return bundle_textures


def dump_textures(
    env, wanted: set[str], textures_dir: Path
) -> tuple[dict[str, dict], int, list[str]]:
    """Returns (astc_by_name, astc_file_count, astc_probe_names)."""
    textures_dir.mkdir(parents=True, exist_ok=True)
    remaining = set(wanted)
    astc_by_name: dict[str, dict] = {}
    astc_files = 0
    astc_probe: list[str] = []

    for obj in env.objects:
        if obj.type.name != "Texture2D":
            continue
        try:
            tex = obj.read()
        except Exception:
            continue
        if is_astc_texture(tex):
            astc_probe.append(tex.m_Name)
        if tex.m_Name not in remaining:
            continue
        img = tex.image
        if img is None:
            print(f"  ATTENTION {tex.m_Name}: indécodable")
            continue
        webp_path = texture_path(textures_dir, tex.m_Name.lower())
        if not migrate_png_beside(webp_path):
            save_lossless_webp(img, webp_path)
        remaining.discard(tex.m_Name)
        settings = texture_settings(tex)
        astc_note = ""
        if is_astc_texture(tex):
            info = astc_webgl_and_block(tex)
            assert info is not None
            webgl_fmt, _block = info
            raw = extract_astc_level0(tex)
            if raw:
                astc_path = textures_dir / f"{tex.m_Name.lower()}.astc"
                astc_path.write_bytes(raw)
                astc_files += 1
                astc_by_name[tex.m_Name] = {
                    "file": astc_path.name,
                    "width": int(tex.m_Width),
                    "height": int(tex.m_Height),
                    "format": webgl_fmt,
                }
                astc_note = f" + {astc_path.name}"
            else:
                print(
                    f"  ATTENTION {tex.m_Name}: ASTC ({webgl_fmt}) "
                    f"sans dump brut — WebP seulement"
                )
        print(
            f"  {tex.m_Name} {img.size} wrap={settings['wrap']} "
            f"mips={settings['mipmaps']} -> {webp_path.name}{astc_note}"
        )

    for name in sorted(remaining):
        print(f"  ATTENTION texture absente du bundle: {name}")

    return astc_by_name, astc_files, astc_probe




def apply_astc_to_manifest(manifest_path: Path, astc_by_name: dict[str, dict]) -> int:
    """Add ``astc`` bindings to manifest texture slots when raw dump succeeded."""
    if not astc_by_name or not manifest_path.is_file():
        return 0
    data = json.loads(manifest_path.read_text())
    patched = 0
    lower_to_astc = {k.lower(): v for k, v in astc_by_name.items()}
    for entry in data.values():
        for binding in entry.get("textures", {}).values():
            if "role" in binding or "astc" in binding:
                continue
            raster = binding.get("file", "")
            if not (raster.endswith(".png") or raster.endswith(".webp")):
                continue
            base = raster.rsplit(".", 1)[0]
            astc = lower_to_astc.get(base)
            if astc:
                binding["astc"] = astc
                patched += 1
            if raster.endswith(".png"):
                binding["file"] = f"{base}.webp"
    manifest_path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")
    return patched


def dump_card_back(
    env, pack: str, card_back_path: Path
) -> bool:
    names = PACK_CARD_BACKS.get(pack, ())
    if not names:
        return False
    wanted = {n.lower() for n in names}
    for obj in env.objects:
        if obj.type.name != "Sprite":
            continue
        try:
            spr = obj.read()
        except Exception:
            continue
        if spr.m_Name.lower() not in wanted:
            continue
        img = spr.image
        if img is None:
            print(f"  ATTENTION sprite {spr.m_Name}: indécodable")
            continue
        card_back_path.parent.mkdir(parents=True, exist_ok=True)
        save_lossless_webp(img, card_back_path)
        legacy = card_back_path.with_suffix(".png")
        if legacy.is_file() and legacy != card_back_path:
            try:
                legacy.unlink()
            except OSError:
                pass
        print(f"  card back: {spr.m_Name} {img.size} -> {card_back_path}")
        return True
    print(f"  ATTENTION card back introuvable pour {pack}: {names}")
    return False


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--pack",
        default="lorcana",
        help="Pack id (default: lorcana) — sorties sous effects/<pack>/",
    )
    parser.add_argument(
        "--data",
        required=True,
        help="Dossier Data de l'APK (data.unity3d ou datapack.unity3d)",
    )
    parser.add_argument("--repo", required=True, help="Racine du repo Placarr")
    args = parser.parse_args()

    from paths import ensure_effects_layout, foil_pack_dir

    repo = Path(args.repo).resolve()
    ensure_effects_layout(repo)
    pack = args.pack
    foil = foil_pack_dir(repo, pack)
    shaders_dir = foil / "shaders"
    textures_dir = foil / "textures"
    manifest_path = repo / "src" / "effects" / pack / "manifest.json"
    card_back_path = foil / "card_back.webp"

    data_file = resolve_data_file(Path(args.data))
    print(f"Bundle: {data_file}")

    env = UnityPy.load(str(data_file))

    print("Phase 1 — shaders (Tilt + Time)")
    tilt_graphs, time_graphs = dump_shaders(env, shaders_dir)

    print("Phase 2 — matériaux")
    bundle_textures = dump_materials(
        env, tilt_graphs, time_graphs, shaders_dir, manifest_path
    )

    print("Phase 3 — textures (PNG + ASTC best-effort)")
    astc_by_name, astc_files, astc_probe = dump_textures(
        env, bundle_textures, textures_dir
    )
    if astc_probe:
        print(
            f"  Textures ASTC repérées dans le bundle: {len(astc_probe)} "
            f"(dump brut best-effort — voir README)"
        )
    astc_bindings = apply_astc_to_manifest(manifest_path, astc_by_name)
    if astc_bindings:
        print(f"  Manifest: {astc_bindings} slot(s) avec binding astc")

    print("Phase 4 — card back")
    card_back_ok = dump_card_back(env, pack, card_back_path)

    print("Terminé.")
    print(
        f"Résumé: pack={pack}, textures matériaux={len(bundle_textures)}, "
        f"fichiers .astc={astc_files}, textures ASTC uniques="
        f"{len(astc_by_name)}, slots manifest astc={astc_bindings}, "
        f"card_back={'oui' if card_back_ok else 'non'}"
    )


if __name__ == "__main__":
    main()
