"""Extract the TCG Live card quad's UV rect (``Card`` Mesh) from the APK.

The Live card art texture is a square 1024² with the card packed inside, so a
material that samples it whole shows the packing margin. The app does not crop
through the material — every ``MAT_Cards3D_*`` ships ``_CardColorDiffuse_ST``
at identity — it crops through the **mesh UVs**: the front face of ``Card``
maps ``u ∈ [0.142, 0.858]`` onto the full card width.

That rect is the only place the crop exists, so it is read from the mesh rather
than guessed from the pixels. Measuring the texture's white margin instead
lands ~3.5% short per side: the app also discards the card's own bleed.

Both samplers (`_CardColorDiffuse`, `_CardWhitePlateMask`) read the same
``vs_TEXCOORD0`` with their own ``_ST`` at identity, so one rect serves art and
masks alike.
"""

from __future__ import annotations

import json
import re
import sys
import tempfile
import zipfile
from pathlib import Path

import UnityPy
from UnityPy.enums import ClassIDType

_LIB = Path(__file__).resolve().parents[1] / "lib"
if str(_LIB) not in sys.path:
    sys.path.insert(0, str(_LIB))

from paths import pack_apks_dir  # noqa: E402

MESH_NAME = "Card"

# Unity serialized files inside the APK, lowercased for a case-insensitive
# match. The hashed resource entries beside them hold no meshes, and skipping
# them turns a 1000-file sweep into ~230.
_SERIALIZED_PREFIXES = (
    "assets/bin/data/sharedassets",
    "assets/bin/data/level",
    "assets/bin/data/globalgamemanagers",
    "assets/bin/data/resources",
)

# Unity splits a large serialized file into ``name.split0`` (the head, which
# carries the header) plus ``.split1``+ continuations. Only the head is a file
# UnityPy can open; it rejoins the rest from disk.
_SPLIT_TAIL_RE = re.compile(r"\.split[1-9]\d*$")

# A card is 63×88mm. Anything outside this band is not the card quad, whatever
# it is called — the guard is what lets us search by name without trusting it.
_ASPECT_MIN = 0.68
_ASPECT_MAX = 0.76

# A planar face maps UV linearly in position. Anything above this means the
# vertices are not one island and the fit is meaningless — fail rather than
# emit a rect averaged across unrelated UV islands.
_MAX_RESIDUAL = 1e-3


def _parse_obj(text: str) -> tuple[list, list, list]:
    positions: list[tuple[float, float, float]] = []
    uvs: list[tuple[float, float]] = []
    normals: list[tuple[float, float, float]] = []
    for line in text.splitlines():
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "v":
            positions.append(tuple(float(x) for x in parts[1:4]))
        elif parts[0] == "vt":
            uvs.append((float(parts[1]), float(parts[2])))
        elif parts[0] == "vn":
            normals.append(tuple(float(x) for x in parts[1:4]))
    return positions, uvs, normals


def _fit(axis: list[float], coord: list[float]) -> tuple[float, float, float]:
    """Least-squares ``coord = a*axis + b``; returns ``(a, b, max_residual)``."""
    n = len(axis)
    sx = sum(axis)
    sy = sum(coord)
    sxx = sum(v * v for v in axis)
    sxy = sum(a * c for a, c in zip(axis, coord))
    denom = n * sxx - sx * sx
    if abs(denom) < 1e-12:
        return 0.0, 0.0, float("inf")
    a = (n * sxy - sx * sy) / denom
    b = (sy - a * sx) / n
    residual = max(abs(a * v + b - c) for v, c in zip(axis, coord))
    return a, b, residual


def card_quad_from_mesh(obj_text: str) -> dict | None:
    """UV rect of the front face, or None when the mesh is not a card quad."""
    positions, uvs, normals = _parse_obj(obj_text)
    if not positions or len(uvs) != len(positions) or len(normals) != len(positions):
        return None

    # Front face only. Taking every vertex mixes in the back face and the rim,
    # and the rim samples a slice of the packing margin — a fit across all
    # three is what makes an honest mesh look like it has no linear mapping.
    front = [i for i in range(len(positions)) if normals[i][2] > 0.5]
    if len(front) < 4:
        return None

    xs = [positions[i][0] for i in front]
    ys = [positions[i][1] for i in front]
    us = [uvs[i][0] for i in front]
    vs = [uvs[i][1] for i in front]

    width = max(xs) - min(xs)
    height = max(ys) - min(ys)
    if width <= 0 or height <= 0:
        return None
    aspect = width / height
    if not (_ASPECT_MIN <= aspect <= _ASPECT_MAX):
        return None

    a_u, b_u, res_u = _fit(xs, us)
    a_v, b_v, res_v = _fit(ys, vs)
    residual = max(res_u, res_v)
    if residual > _MAX_RESIDUAL:
        return None

    u0, u1 = a_u * min(xs) + b_u, a_u * max(xs) + b_u
    v0, v1 = a_v * min(ys) + b_v, a_v * max(ys) + b_v
    return {
        "mesh": MESH_NAME,
        "uvRect": {
            "u0": min(u0, u1),
            "u1": max(u0, u1),
            "v0": min(v0, v1),
            "v1": max(v0, v1),
        },
        "aspect": aspect,
        "frontVertices": len(front),
        "residual": residual,
    }


def _quad_from_serialized(path: Path) -> dict | None:
    try:
        env = UnityPy.load(str(path))
    except Exception:
        return None
    for obj in env.objects:
        if obj.type != ClassIDType.Mesh:
            continue
        try:
            data = obj.read()
        except Exception:
            continue
        if (getattr(data, "m_Name", None) or "").strip() != MESH_NAME:
            continue
        try:
            quad = card_quad_from_mesh(data.export())
        except Exception:
            continue
        if quad is not None:
            return quad
    return None


def card_quad_from_apk(apk: Path) -> dict | None:
    """Scan the APK's serialized files for the card quad. None when absent.

    Files are unpacked to a temp dir and loaded **by path**: a ``.splitN``
    chunk is a continuation, not a serialized file, and handing UnityPy its
    bytes alone segfaults. Given the head file on disk it rejoins the siblings
    itself, so only heads are opened.
    """
    if not apk.is_file():
        return None
    try:
        archive = zipfile.ZipFile(apk)
    except Exception as err:
        print(f"  card quad: cannot open {apk.name}: {err}", flush=True)
        return None

    with archive, tempfile.TemporaryDirectory() as tmp:
        members = [
            n
            for n in archive.namelist()
            if n.lower().startswith(_SERIALIZED_PREFIXES)
        ]
        if not members:
            print(f"  card quad: no serialized files in {apk.name}", flush=True)
            return None
        archive.extractall(tmp, members=members)
        root = Path(tmp)
        heads = sorted(
            p
            for p in root.rglob("*")
            if p.is_file() and not _SPLIT_TAIL_RE.search(p.name)
        )
        for path in heads:
            quad = _quad_from_serialized(path)
            if quad is None:
                continue
            quad["source"] = str(path.relative_to(root))
            rect = quad["uvRect"]
            print(
                f"  card quad: {quad['source']} "
                f"u[{rect['u0']:.6f},{rect['u1']:.6f}] "
                f"v[{rect['v0']:.6f},{rect['v1']:.6f}] "
                f"aspect={quad['aspect']:.6f} residual={quad['residual']:.2e}",
                flush=True,
            )
            return quad
    print(f"  card quad: {MESH_NAME} mesh not found in {apk.name}", flush=True)
    return None


def unity_st(quad: dict) -> dict:
    """Mesh UV rect → Unity ``*_ST`` (tiling ``xy``, offset ``zw``)."""
    rect = quad["uvRect"]
    return {
        "scale": [rect["u1"] - rect["u0"], rect["v1"] - rect["v0"]],
        "offset": [rect["u0"], rect["v0"]],
    }


def dump_pokemon_card_quad(repo: Path, dest: Path) -> dict | None:
    """``data/pokemon/staging/apks/base.apk`` → ``dest`` (runtime JSON). None on miss."""
    apk = pack_apks_dir(repo, "pokemon") / "base.apk"
    quad = card_quad_from_apk(apk)
    if quad is None:
        return None
    payload = {**quad, "st": unity_st(quad)}
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return payload
