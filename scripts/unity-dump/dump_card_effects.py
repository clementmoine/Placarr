"""Extract everything the web port needs from a Unity TCG app's data bundle.

One command, three phases, in dependency order:

1. **shaders** — every card-effect shader variant, carved out of the LZ4 blob
   and rewritten as a WebGL2-ready fragment (`public/foil/unity/shaders/`).
   Android builds target GLES3+, so the "compiled" programs are GLSL *text* in
   the exact dialect WebGL2 speaks; the rewrite is two macro flips, zero math.
2. **materials** — the full binding table of every card-effect material,
   filtered per fragment to the uniforms it actually declares
   (`src/core/render/unityFoil/manifest.json`).
3. **textures** — every texture those materials reference, as PNG
   (`public/foil/unity/textures/`). Per-card samples (the app's placeholder
   art) are skipped: at runtime the artwork and masks come from the catalogue.

Usage:
    python dump_card_effects.py --data <apk>/assets/bin/Data --repo <repo root>

Requires: UnityPy, lz4, Pillow (see requirements.txt).

The keyword filters (`CARD_EFFECT_KEYS`, scroll modes) are the only
Lorcana-specific knowledge here; point them at another game's vocabulary and
the pipeline is reusable as is — see docs/tcg_support.md §9.
"""

from __future__ import annotations

import argparse
import json
import re
import struct
from pathlib import Path

import lz4.block
import UnityPy

# A shader or material is a card effect if its name mentions one of these.
CARD_EFFECT_KEYS = ("Foil", "Varnish", "Holo")

# The app compiles one variant per scroll driver: `Time` self-animates,
# `Tilt` follows the device. Both are dumped — the web port runs Time at
# rest and Tilt under the pointer / gyroscope, same split as the app.
SCROLL_TILT = "_SCROLLMODE_TILT"
SCROLL_TIME = "_SCROLLMODE_TIME"

# Texture slots whose content is per-card, not per-effect. The bundle only
# holds the app's sample card behind them; at runtime the real artwork and
# masks take their place.
RUNTIME_ROLES = {
    "_Motif": "art",
    "_MotifMask": "foilMask",
    "_TopLayerMask": "varnishMask",
    "_SecondTopLayerMask": "secondVarnishMask",
    "_NormalMap": "normals",
}


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


# ---------------------------------------------------------------------------
# Phase 1 — shader variants
# ---------------------------------------------------------------------------


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
    """The GLSL text of blob entry *i*, or None for parameter-only entries."""
    eoff, elen, _seg = struct.unpack_from("<iii", data, 4 + i * 12)
    start = data.find(b"#version", eoff, eoff + elen)
    if start == -1:
        return None
    end = data.find(b"\x00", start, eoff + elen)
    if end == -1:
        end = eoff + elen
    return data[start:end].decode("utf-8", errors="replace")


def variant_map(parsed_form) -> dict[int, list[str]]:
    """blobIndex -> keyword names, read off every pass's player subprograms."""
    kw_names = list(parsed_form.m_KeywordNames)
    mapping: dict[int, list[str]] = {}
    for sub in parsed_form.m_SubShaders:
        for pas in sub.m_Passes:
            for kind in ("progVertex", "progFragment"):
                prog = getattr(pas, kind, None)
                if prog is None:
                    continue
                # Hardware tiers repeat the same blob indices; one is enough.
                for tier in (prog.m_PlayerSubPrograms or [])[:1]:
                    items = tier if isinstance(tier, list) else [tier]
                    for p in items:
                        kws = sorted(
                            kw_names[k] for k in (p.m_KeywordIndices or [])
                        )
                        mapping.setdefault(p.m_BlobIndex, kws)
    return mapping


def to_webgl2_fragment(src: str) -> str:
    """The FRAGMENT half of a GLES3 translation unit, WebGL2-ready.

    Two macro flips and nothing else — the math ships untouched:
    - no uniform buffers, so every material value is a plain named uniform;
    - no layout(location) on samplers, which GLSL ES 3.00 does not allow.
    """
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
    """The keywords that pick a variant, minus scroll mode and engine noise.

    Keywords keep their leading `_`. Joined with `__`, that yields the `___`
    separators the historical filenames use (`Graph___KEY_A___KEY_B.frag`).
    """
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
    """Write Tilt and Time fragment variants.

    Returns `(tilt_graphs, time_graphs)` — each is graph -> variant_key -> file.
    Filenames match the historical Tilt naming (`Graph___KEY.frag`); Time
    variants append `___SCROLLMODE_TIME` before `.frag`.
    """
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
            # `key` already starts with `_` on each keyword; `__` + key → `___KEY`.
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


# ---------------------------------------------------------------------------
# Phase 2 — materials
# ---------------------------------------------------------------------------

UNIFORM_RE = re.compile(
    r"(?:UNITY_UNIFORM|uniform)\s+(?:mediump\s+|highp\s+|lowp\s+)?"
    r"(?:vec[234]|float|int|sampler2D)\s+(_\w+)\s*;"
)


def fragment_uniforms(frag_src: str) -> set[str]:
    """Every `_Name` uniform a fragment declares, minus the compiler's dead
    weight (`Xhlslcc_UnusedX*` never reaches the GPU)."""
    return {
        n
        for n in UNIFORM_RE.findall(frag_src)
        if not n.startswith("Xhlslcc_UnusedX")
    }


def resolve_variant(
    variants: dict[str, str], keywords: list[str]
) -> str | None:
    """The variant a material's keywords select.

    Exact match first. Failing that, the smallest strict superset: a keyword
    enum's default value is not recorded on the material, but the compiled
    variant still carries it — e.g. a material saying only `_VARNISHTYPE_NONE`
    runs the `_HOTFOILSURFACE_<default>__VARNISHTYPE_NONE` program.
    """
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


# Unity TextureWrapMode / FilterMode enums, as integers on Texture2D.
WRAP_MODE = {0: "repeat", 1: "clamp", 2: "mirror", 3: "mirrorOnce"}
FILTER_MODE = {0: "point", 1: "bilinear", 2: "trilinear"}


def texture_settings(tex) -> dict:
    """Sampler state the APK recorded for this Texture2D."""
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
    """Write the manifest; return the bundle textures the materials bind."""
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

        # Union of uniforms either scroll program declares, so idle and hover
        # share one binding table (Time-only `_TimeFactor` still ships).
        used = fragment_uniforms((shaders_dir / fragment).read_text())
        if fragment_time:
            used |= fragment_uniforms((shaders_dir / fragment_time).read_text())

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
                binding: dict = {"file": f"{tex_name.lower()}.png"}
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


# ---------------------------------------------------------------------------
# Phase 3 — textures
# ---------------------------------------------------------------------------


def dump_textures(env, wanted: set[str], textures_dir: Path) -> None:
    textures_dir.mkdir(parents=True, exist_ok=True)
    remaining = set(wanted)
    for obj in env.objects:
        if obj.type.name != "Texture2D":
            continue
        try:
            tex = obj.read()
        except Exception:
            continue
        if tex.m_Name not in remaining:
            continue
        img = tex.image
        if img is None:
            print(f"  ATTENTION {tex.m_Name}: indécodable")
            continue
        path = textures_dir / f"{tex.m_Name.lower()}.png"
        img.save(path)
        remaining.discard(tex.m_Name)
        settings = texture_settings(tex)
        print(
            f"  {tex.m_Name} {img.size} wrap={settings['wrap']} "
            f"mips={settings['mipmaps']} -> {path.name}"
        )
    for name in sorted(remaining):
        print(f"  ATTENTION texture absente du bundle: {name}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data",
        required=True,
        help="Dossier Data de l'APK (contient data.unity3d)",
    )
    parser.add_argument("--repo", required=True, help="Racine du repo Placarr")
    args = parser.parse_args()

    repo = Path(args.repo)
    shaders_dir = repo / "public" / "foil" / "unity" / "shaders"
    textures_dir = repo / "public" / "foil" / "unity" / "textures"
    manifest_path = repo / "src" / "core" / "render" / "unityFoil" / "manifest.json"

    env = UnityPy.load(str(Path(args.data) / "data.unity3d"))

    print("Phase 1 — shaders (Tilt + Time)")
    tilt_graphs, time_graphs = dump_shaders(env, shaders_dir)
    print("Phase 2 — matériaux")
    bundle_textures = dump_materials(
        env, tilt_graphs, time_graphs, shaders_dir, manifest_path
    )
    print("Phase 3 — textures")
    dump_textures(env, bundle_textures, textures_dir)
    print("Terminé.")


if __name__ == "__main__":
    main()
