"""Lorcana Unity dump from a local APK (or extracted --data directory)."""

from __future__ import annotations

import shutil
import tempfile
import zipfile
from pathlib import Path

import UnityPy

import dump_unity
from paths import ensure_effects_layout, foil_pack_dir

PACKAGE = "com.ravensburger.disney.lorcana"
PLAY_HINT = f"https://play.google.com/store/apps/details?id={PACKAGE}"


def _apk_has_unity_data(apk: Path) -> bool:
    """True if the APK ships a Unity bundle (not just Managed metadata)."""
    try:
        with zipfile.ZipFile(apk) as zf:
            names = zf.namelist()
            return any(
                n.endswith("/data.unity3d")
                or n.endswith("/datapack.unity3d")
                or n == "assets/bin/Data/data.unity3d"
                or n == "assets/bin/Data/datapack.unity3d"
                for n in names
            )
    except zipfile.BadZipFile:
        return False


def _extract_unity_data(apk: Path, data_dir: Path) -> int:
    """Merge ``assets/bin/Data`` from ``apk`` into ``data_dir``. Returns file count."""
    data_dir.mkdir(parents=True, exist_ok=True)
    n_files = 0
    with zipfile.ZipFile(apk) as zf:
        members = [n for n in zf.namelist() if n.startswith("assets/bin/Data/")]
        if not members:
            raise RuntimeError(f"{apk.name}: no assets/bin/Data/")
        for name in members:
            rel = name[len("assets/bin/Data/") :]
            if not rel or name.endswith("/"):
                continue
            out = data_dir / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(name) as src, open(out, "wb") as dst:
                shutil.copyfileobj(src, dst)
            n_files += 1
    return n_files


def _unity_apks(apk_dir: Path) -> list[Path]:
    """APKs that ship Unity ``data.unity3d`` / ``datapack.unity3d``."""
    apks = sorted(apk_dir.glob("*.apk"))
    if not apks:
        raise FileNotFoundError(f"no APK under {apk_dir}")
    with_data = [p for p in apks if _apk_has_unity_data(p)]
    if not with_data:
        raise RuntimeError(f"no APK under {apk_dir} contains a Unity data bundle")

    def sort_key(p: Path) -> tuple[int, str]:
        name = p.name.lower()
        # base first (data.unity3d / shaders), then asset pack (datapack)
        if name == "base.apk" or name.endswith("base.apk"):
            return (0, name)
        if "unitydataassetpack" in name:
            return (1, name)
        return (2, name)

    return sorted(with_data, key=sort_key)


def _data_from_apks(apks: list[Path], persist: Path) -> Path:
    """Merge Data from every APK into ``persist`` (base + UnityDataAssetPack)."""
    if not apks:
        raise FileNotFoundError("no APKs to extract")
    with tempfile.TemporaryDirectory(prefix="placarr-lorcana-apk-") as tmp:
        extracted = Path(tmp) / "extracted" / "Data"
        for apk in apks:
            apk = apk.resolve()
            if not apk.is_file():
                raise FileNotFoundError(f"--apk not a file: {apk}")
            if apk.suffix.lower() != ".apk":
                raise RuntimeError(f"--apk must be a .apk file (got {apk})")
            n = _extract_unity_data(apk, extracted)
            print(f"  Extracted {n} file(s) from {apk.name}")
        if persist.exists():
            shutil.rmtree(persist)
        shutil.copytree(extracted, persist)
    return persist


def _resolve_apk_inputs(apk: Path) -> list[Path]:
    """If ``apk`` sits next to siblings, merge the whole apks/ folder."""
    apk = apk.resolve()
    parent = apk.parent
    siblings = _unity_apks(parent) if parent.is_dir() else []
    if siblings:
        return siblings
    if not _apk_has_unity_data(apk):
        raise RuntimeError(f"{apk.name}: no data.unity3d / datapack.unity3d")
    return [apk]


def run(
    *,
    repo: Path,
    serial: str | None = None,
    data: Path | None = None,
    apk: Path | None = None,
    timeout_s: float = 600,
) -> dict:
    del serial, timeout_s  # ADB removed — APK / --data only
    ensure_effects_layout(repo)
    persist = repo / "data" / "lorcana" / "unity-data"

    if data is not None:
        data_dir = Path(data).resolve()
        if not data_dir.is_dir():
            raise FileNotFoundError(f"--data not a directory: {data_dir}")
        print(f"Using local Unity Data: {data_dir}")
    elif apk is not None:
        inputs = _resolve_apk_inputs(Path(apk))
        print("Using APK(s): " + ", ".join(p.name for p in inputs))
        data_dir = _data_from_apks(inputs, persist)
    elif persist.is_dir():
        print(f"Using cached Unity Data: {persist}")
        data_dir = persist
    else:
        default_apks = repo / "data" / "lorcana" / "apks"
        if default_apks.is_dir() and any(default_apks.glob("*.apk")):
            inputs = _unity_apks(default_apks)
            print("Using APK(s): " + ", ".join(p.name for p in inputs))
            data_dir = _data_from_apks(inputs, persist)
        else:
            raise SystemExit(
                "lorcanamobile requires --apk <file.apk> or --data <Unity Data dir> "
                "(or APKs under data/lorcana/apks/)."
            )

    pack = "lorcana"
    foil = foil_pack_dir(repo, pack)
    shaders_dir = foil / "shaders"
    textures_dir = foil / "textures"
    manifest_path = repo / "src" / "effects" / pack / "manifest.json"
    card_back_path = foil / "card_back.webp"

    data_file = dump_unity.resolve_data_file(data_dir)
    print(f"Bundle: {data_file}")
    # Load ONE bundle only. Merging datapack.unity3d into the same Environment
    # remaps path_ids and binds foil materials to unrelated Texture2Ds
    # (e.g. "Learn to Play_Slide*" tutorial art).
    preferred = data_dir / "data.unity3d"
    if preferred.is_file():
        data_file = preferred
        print(f"Using primary bundle: {data_file.name}")
    env = UnityPy.load(str(data_file))
    if (data_dir / "datapack.unity3d").is_file() and data_file.name != "datapack.unity3d":
        print(
            "Note: datapack.unity3d present but not merged "
            "(avoids Texture2D path_id collisions)."
        )

    print("Phase 1 — shaders")
    tilt_graphs, time_graphs = dump_unity.dump_shaders(env, shaders_dir)
    print("Phase 2 — materials")
    bundle_textures = dump_unity.dump_materials(
        env, tilt_graphs, time_graphs, shaders_dir, manifest_path
    )
    if not tilt_graphs and not time_graphs:
        raise RuntimeError(
            "Aucun shader card-effect trouvé — fusionne base.apk + "
            "split_UnityDataAssetPack.apk (data.unity3d manquant ?)."
        )
    print("Phase 3 — textures")
    if textures_dir.is_dir():
        for stale in textures_dir.glob("*"):
            if stale.suffix.lower() in {".png", ".astc", ".jpg", ".jpeg", ".webp"}:
                stale.unlink(missing_ok=True)
    astc_by_name, astc_files, _ = dump_unity.dump_textures(
        env, bundle_textures, textures_dir
    )
    dump_unity.apply_astc_to_manifest(manifest_path, astc_by_name)
    print("Phase 4 — card back")
    dump_unity.dump_card_back(env, pack, card_back_path)

    return {
        "provider": "lorcanamobile",
        "pack": pack,
        "shaders": len(tilt_graphs) + len(time_graphs),
        "textures": len(bundle_textures),
        "astcFiles": astc_files,
        "manifest": str(manifest_path),
        "foil": str(foil),
        "playStore": PLAY_HINT,
    }


if __name__ == "__main__":
    import argparse
    import json

    ap = argparse.ArgumentParser(description="Lorcana Unity dump from APK / Data dir")
    ap.add_argument("--repo", type=Path, default=Path.cwd())
    ap.add_argument("--apk", type=Path, default=None)
    ap.add_argument("--data", type=Path, default=None)
    args = ap.parse_args()
    result = run(repo=args.repo.resolve(), apk=args.apk, data=args.data)
    print(json.dumps(result, indent=2, default=str))

