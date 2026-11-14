#!/usr/bin/env python3
"""Fetch naruto-card.jp /media/cards/*.jpg via real Chrome (Vercel 429 on curl/Flare).

Reads a faces ledger JSON (or a plain URL list) and writes JPEG blobs under
`--out-dir` named by sha1(url). Stock FlareSolverr cannot download these assets;
Chromium page.fetch after a same-origin navigation succeeds.

Usage:
  python3 scripts/narutocardjpBrowserFetch.py \\
    --ledger data/naruto/carddass/staging/narutocardjp/carddass-ja.faces.json \\
    --out-dir data/naruto/carddass/staging/narutocardjp/blobs
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path


ORIGIN = "https://naruto-card.jp/"


def sha1_url(url: str) -> str:
    return hashlib.sha1(url.encode("utf-8")).hexdigest()


def collect_urls(ledger_path: Path | None, url_args: list[str]) -> list[str]:
    urls: list[str] = []
    seen: set[str] = set()
    if ledger_path:
        data = json.loads(ledger_path.read_text(encoding="utf-8"))
        faces = data.get("faces") or []
        for face in faces:
            url = face.get("imageUrl") if isinstance(face, dict) else None
            if not url or url in seen:
                continue
            seen.add(url)
            urls.append(url)
    for url in url_args:
        if url and url not in seen:
            seen.add(url)
            urls.append(url)
    return urls


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ledger", type=Path, help="narutocardjp *.faces.json")
    parser.add_argument("--url", action="append", default=[], help="single image URL")
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--force", action="store_true")
    parser.add_argument(
        "--warmup",
        default=ORIGIN,
        help="Same-origin page to warm cookies before media fetch",
    )
    args = parser.parse_args()

    urls = collect_urls(args.ledger, args.url)
    if args.limit > 0:
        urls = urls[: args.limit]
    if not urls:
        print(json.dumps({"ok": True, "written": 0, "skipped": 0, "failed": 0}))
        return 0

    args.out_dir.mkdir(parents=True, exist_ok=True)

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright missing: pip install playwright", file=sys.stderr)
        return 2

    written = skipped = failed = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page()
        page.goto(args.warmup, wait_until="domcontentloaded", timeout=90_000)

        for i, url in enumerate(urls, 1):
            dest = args.out_dir / f"{sha1_url(url)}.jpg"
            if dest.exists() and dest.stat().st_size >= 2000 and not args.force:
                skipped += 1
                continue
            try:
                data = page.evaluate(
                    """async (url) => {
                      const res = await fetch(url, { credentials: 'include' });
                      const buf = await res.arrayBuffer();
                      const bytes = new Uint8Array(buf);
                      let binary = '';
                      const chunk = 0x8000;
                      for (let i = 0; i < bytes.length; i += chunk) {
                        binary += String.fromCharCode.apply(
                          null,
                          bytes.subarray(i, i + chunk),
                        );
                      }
                      return {
                        status: res.status,
                        type: res.headers.get('content-type') || '',
                        b64: btoa(binary),
                      };
                    }""",
                    url,
                )
                status = int(data.get("status") or 0)
                raw = __import__("base64").b64decode(data.get("b64") or "")
                ctype = str(data.get("type") or "")
                looks_image = (
                    raw[:2] == b"\xff\xd8"
                    or raw[:4] == b"\x89PNG"
                    or "jpeg" in ctype
                    or "png" in ctype
                    or "webp" in ctype
                )
                if status != 200 or len(raw) < 2000 or not looks_image:
                    failed += 1
                    if i <= 3 or i % 50 == 0:
                        print(
                            f"  fail {i}/{len(urls)} status={status} size={len(raw)}",
                            file=sys.stderr,
                        )
                else:
                    dest.write_bytes(raw)
                    written += 1
                    if i % 25 == 0 or i == len(urls):
                        print(
                            f"  progress {i}/{len(urls)} written={written} skipped={skipped} failed={failed}",
                            file=sys.stderr,
                        )
            except Exception as exc:  # noqa: BLE001
                failed += 1
                print(f"  error {i}/{len(urls)}: {exc}", file=sys.stderr)
            # Light pacing — Vercel rate-limits aggressive bursts.
            time.sleep(0.05)

        browser.close()

    print(
        json.dumps(
            {
                "ok": True,
                "written": written,
                "skipped": skipped,
                "failed": failed,
                "total": len(urls),
                "outDir": str(args.out_dir),
            }
        )
    )
    return 0 if failed == 0 or written > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
