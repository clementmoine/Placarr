#!/usr/bin/env python3
"""Dump Rainier CDN AssetManifest asset names (UnityPy).

    {contentBase}{bucket}/manifest_{locale}_{bucket}

Example:
  python dump_cdn_manifest.py \\
    --content-base https://cdn.studio-prod.pokemon.com/rainier/Content/Android/1.40.0/ \\
    --bucket 10101_0000 --locale fr \\
    --out data/pokemon/cdn-manifests/manifest_fr_10101_0000.json
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


def parse_asset_names(data: bytes) -> list[str]:
    env = UnityPy.load(data)
    names: list[str] = []
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
            if isinstance(entry, dict):
                name = entry.get("assetName") or entry.get("m_Name")
                if isinstance(name, str) and name.strip():
                    names.append(name.strip())
    # stable unique
    seen: set[str] = set()
    out: list[str] = []
    for n in names:
        key = n.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(n)
    out.sort(key=str.lower)
    return out


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--content-base", required=True)
    p.add_argument("--bucket", default="10101_0000")
    p.add_argument("--locale", default="fr")
    p.add_argument("--out", required=True)
    p.add_argument("--timeout", type=float, default=60.0)
    args = p.parse_args(argv)

    url = manifest_url(args.content_base, args.bucket, args.locale)
    print(f"GET {url}", flush=True)
    data = fetch_bytes(url, timeout=args.timeout)
    if not data.startswith(b"UnityFS"):
        print("error: response is not UnityFS", file=sys.stderr)
        return 2
    assets = parse_asset_names(data)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "contentBase": args.content_base
        if args.content_base.endswith("/")
        else args.content_base + "/",
        "bucket": args.bucket,
        "locale": args.locale,
        "assetCount": len(assets),
        "assets": assets,
        "source": url,
    }
    out_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "assetCount": len(assets), "out": str(out_path)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
