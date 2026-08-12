#!/usr/bin/env python3
"""Dump Rainier CDN AssetManifest asset names (UnityPy).

    {contentBase}{bucket}/manifest_{locale}_{bucket}

Example:
  python dump_cdn_manifest.py \\
    --content-base https://cdn.studio-prod.pokemon.com/rainier/Content/Android/1.40.0/ \\
    --bucket 10101_0000 --locale fr \\
    --out data/pokemon/staging/cdn-manifests/manifest_fr_10101_0000.json
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

import UnityPy

DEFAULT_UA = "UnityPlayer/6000.3.5f2 (UnityWebRequest/1.0, libcurl/8.10.1-DEV)"


def manifest_url(content_base: str, bucket: str, locale: str) -> str:
    base = content_base if content_base.endswith("/") else content_base + "/"
    return f"{base}{bucket}/manifest_{locale}_{bucket}"


def fetch_bytes(url: str, timeout: float = 60.0) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": DEFAULT_UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def resolve_buckets(
    buckets_arg: str | None, fallback: str, dirs_manifest: str | None
) -> list[str]:
    """``all`` reads ``directories`` out of asset-bundle-manifest_0.0.json."""
    if not buckets_arg:
        return [fallback]
    if buckets_arg.strip().lower() != "all":
        return [s.strip() for s in buckets_arg.split(",") if s.strip()]
    if not dirs_manifest:
        raise SystemExit("--buckets all requires --dirs-manifest")
    path = Path(dirs_manifest)
    if not path.is_file():
        raise SystemExit(
            f"--dirs-manifest not found: {path}"
            " (expected staging/config-cache/asset-bundle-manifest_0.0.json)"
        )
    raw = json.loads(path.read_text(encoding="utf-8"))
    inner = json.loads(raw["keys"]["manifest"]["contentString"])
    dirs = [str(d) for d in (inner.get("directories") or [])]
    return dirs or [fallback]


def parse_asset_entries(data: bytes) -> list[dict]:
    """``assetList`` rows: name + crc + hash + deps (crc lets us skip re-GETs)."""
    env = UnityPy.load(data)
    rows: list[dict] = []
    for obj in env.objects:
        if obj.type.name != "MonoBehaviour":
            continue
        try:
            tree = obj.read_typetree()
        except Exception:
            continue
        asset_list = tree.get("assetList") or tree.get("m_assetList")
        if asset_list is None:
            for _key, val in tree.items():
                if (
                    isinstance(val, list)
                    and val
                    and isinstance(val[0], dict)
                    and "assetName" in val[0]
                ):
                    asset_list = val
                    break
        if not asset_list:
            continue
        for entry in asset_list:
            if not isinstance(entry, dict):
                continue
            name = entry.get("assetName") or entry.get("m_Name")
            if not isinstance(name, str) or not name.strip():
                continue
            deps = entry.get("dependencies")
            rows.append(
                {
                    "name": name.strip(),
                    "crc": entry.get("crc"),
                    "hash": entry.get("hash"),
                    "dependencies": [d for d in deps if isinstance(d, str)]
                    if isinstance(deps, list)
                    else [],
                }
            )
    # stable unique on name
    seen: set[str] = set()
    out: list[dict] = []
    for r in rows:
        key = r["name"].lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    out.sort(key=lambda r: r["name"].lower())
    return out


def parse_asset_names(data: bytes) -> list[str]:
    return [r["name"] for r in parse_asset_entries(data)]


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--content-base", required=True)
    p.add_argument("--bucket", default="10101_0000")
    p.add_argument("--locale", default="fr")
    p.add_argument("--out")
    p.add_argument("--timeout", type=float, default=60.0)
    p.add_argument(
        "--buckets",
        help="Comma list, or 'all' to read directories from --dirs-manifest",
    )
    p.add_argument("--locales", help="Comma list (default: --locale)")
    p.add_argument("--out-dir", help="Write manifest_<locale>_<bucket>.json here")
    p.add_argument("--dirs-manifest", help="asset-bundle-manifest_0.0.json path")
    p.add_argument("--skip-existing", action="store_true")
    args = p.parse_args(argv)

    if not args.out and not args.out_dir:
        p.error("one of --out / --out-dir is required")

    buckets = resolve_buckets(args.buckets, args.bucket, args.dirs_manifest)
    locales = (
        [s.strip() for s in args.locales.split(",") if s.strip()]
        if args.locales
        else [args.locale]
    )
    single = args.out and len(buckets) == 1 and len(locales) == 1

    written: list[str] = []
    failed: list[dict] = []
    total = 0
    for bucket in buckets:
        for locale in locales:
            out_path = (
                Path(args.out)
                if single
                else Path(args.out_dir) / f"manifest_{locale}_{bucket}.json"
            )
            if args.skip_existing and out_path.exists():
                continue
            url = manifest_url(args.content_base, bucket, locale)
            try:
                data = fetch_bytes(url, timeout=args.timeout)
            except Exception as exc:  # 403 = bucket/locale not published
                failed.append({"bucket": bucket, "locale": locale, "error": str(exc)})
                continue
            if not data.startswith(b"UnityFS"):
                failed.append(
                    {"bucket": bucket, "locale": locale, "error": "not-unityfs"}
                )
                continue
            entries = parse_asset_entries(data)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(
                json.dumps(
                    {
                        "contentBase": args.content_base
                        if args.content_base.endswith("/")
                        else args.content_base + "/",
                        "bucket": bucket,
                        "locale": locale,
                        "assetCount": len(entries),
                        "assets": [r["name"] for r in entries],
                        "entries": entries,
                        "source": url,
                    },
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )
            written.append(str(out_path))
            total += len(entries)
            print(
                f"  [ok] {locale}/{bucket} assets={len(entries)}",
                flush=True,
            )

    print(
        json.dumps(
            {
                "ok": not failed or bool(written),
                "buckets": len(buckets),
                "locales": len(locales),
                "written": len(written),
                "failed": failed,
                "assetRows": total,
            }
        )
    )
    return 0 if written or not failed else 2


if __name__ == "__main__":
    raise SystemExit(main())
