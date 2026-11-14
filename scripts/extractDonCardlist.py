#!/usr/bin/env python3
"""Extract DON!! faces from the official Bandai cardlist PDF with product identity.

Identity:
  - donIndex: 1-based unique face order in the PDF (LTR, top-to-bottom)
  - labelJa: caption printed under each face (stacked lines joined)
  - productCode: 【CODE】 parsed from the caption when present

Requires: pymupdf (pip install pymupdf)

Usage:
  python scripts/extractDonCardlist.py \\
    --pdf data/onepiece/staging/don-cardlist-jp.pdf \\
    --out data/onepiece/staging/don-cardlist-extract
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

import pymupdf

TITLE = re.compile(r"^ドン!!カードリスト$")
CODE_RE = re.compile(r"【([^】]+)】")


def page_label_lines(page: pymupdf.Page) -> list[dict]:
  lines: list[dict] = []
  for block in page.get_text("dict")["blocks"]:
    if block.get("type") != 0:
      continue
    for line in block.get("lines", []):
      spans = line.get("spans", [])
      if not spans:
        continue
      text = "".join(s.get("text", "") for s in spans).strip()
      if not text or TITLE.match(text):
        continue
      xs = [s["bbox"][0] for s in spans] + [s["bbox"][2] for s in spans]
      ys = [s["bbox"][1] for s in spans] + [s["bbox"][3] for s in spans]
      lines.append(
        {"text": text, "x0": min(xs), "y0": min(ys), "x1": max(xs), "y1": max(ys)}
      )
  return lines


def extract_code(text: str | None) -> str | None:
  if not text:
    return None
  m = CODE_RE.search(text)
  return m.group(1) if m else None


def label_slug(label: str | None, code: str | None) -> str:
  if code:
    return re.sub(r"[^a-zA-Z0-9]+", "-", code).strip("-").lower()
  if not label:
    return "unlabeled"
  slug = re.sub(r"[^a-zA-Z0-9]+", "-", label)[:48].strip("-").lower()
  return slug or ("ja-" + hashlib.md5(label.encode()).hexdigest()[:8])


def caption_for_card(card: dict, lines: list[dict]) -> str | None:
  """Join 1–2 stacked caption lines under the card in the same column."""
  cands: list[tuple[float, dict]] = []
  for lab in lines:
    if lab["y0"] < card["y1"] - 5:
      continue
    if lab["y0"] > card["y1"] + 60:
      continue
    overlap = min(card["x1"], lab["x1"]) - max(card["x0"], lab["x0"])
    cx = (card["x0"] + card["x1"]) / 2
    lcx = (lab["x0"] + lab["x1"]) / 2
    if overlap < 8 and abs(cx - lcx) > (card["x1"] - card["x0"]) * 0.55:
      continue
    dy = max(0.0, lab["y0"] - card["y1"])
    score = dy + abs(cx - lcx) * 0.02 - max(overlap, 0) * 0.02
    cands.append((score, lab))
  if not cands:
    return None
  cands.sort(key=lambda x: x[0])
  first = cands[0][1]
  band: list[dict] = []
  for _, lab in cands:
    overlap = min(first["x1"], lab["x1"]) - max(first["x0"], lab["x0"])
    lcx = (lab["x0"] + lab["x1"]) / 2
    fcx = (first["x0"] + first["x1"]) / 2
    if overlap < 5 and abs(lcx - fcx) > 45:
      continue
    # Captions are 2 lines that slightly overlap in y.
    if abs(lab["y0"] - first["y0"]) > 28:
      continue
    if lab["text"] not in {b["text"] for b in band}:
      band.append(lab)
  band.sort(key=lambda lab: lab["y0"])
  return " ".join(b["text"] for b in band)


def extract(pdf_path: Path, out: Path, source_url: str) -> dict:
  cards_dir = out / "cards"
  cards_dir.mkdir(parents=True, exist_ok=True)
  for stale in cards_dir.glob("*"):
    stale.unlink()

  doc = pymupdf.open(pdf_path)
  cards: list[dict] = []
  seen_xref: set[int] = set()
  don_idx = 0

  for pi in range(doc.page_count):
    page = doc[pi]
    pw, ph = page.rect.width, page.rect.height
    lines = page_label_lines(page)

    img_items: list[dict] = []
    for img in page.get_images(full=True):
      xref = img[0]
      try:
        rects = page.get_image_rects(xref)
      except Exception:
        continue
      if not rects:
        continue
      r = rects[0]
      # Skip full-page splash / hero art.
      if (r.x1 - r.x0) > pw * 0.85 and (r.y1 - r.y0) > ph * 0.55:
        continue
      try:
        extracted = doc.extract_image(xref)
      except Exception:
        continue
      w, h = extracted.get("width"), extracted.get("height")
      if not w or not h:
        continue
      if not (w >= 300 and h >= 400 and 0.55 < w / h < 0.85):
        continue
      img_items.append(
        {
          "xref": xref,
          "x0": r.x0,
          "y0": r.y0,
          "x1": r.x1,
          "y1": r.y1,
          "w": w,
          "h": h,
          "ext": extracted.get("ext") or "png",
          "raw": extracted["image"],
        }
      )
    img_items.sort(key=lambda it: (round(it["y0"] / 12), round(it["x0"] / 12)))

    for slot, it in enumerate(img_items, 1):
      label = caption_for_card(it, lines)
      code = extract_code(label)
      sha = hashlib.sha256(it["raw"]).hexdigest()
      dup = it["xref"] in seen_xref
      if not dup:
        seen_xref.add(it["xref"])
        don_idx += 1
        idx = don_idx
        fname = f"{idx:03d}_{label_slug(label, code)}.{it['ext']}"
        (cards_dir / fname).write_bytes(it["raw"])
        rel = f"cards/{fname}"
      else:
        idx = None
        rel = None
      cards.append(
        {
          "donIndex": idx,
          "page": pi + 1,
          "slot": slot,
          "xref": it["xref"],
          "dedup": dup,
          "width": it["w"],
          "height": it["h"],
          "bbox": [
            round(it["x0"], 1),
            round(it["y0"], 1),
            round(it["x1"], 1),
            round(it["y1"], 1),
          ],
          "sha256": sha,
          "labelJa": label,
          "productCode": code,
          "file": rel,
        }
      )

  unique = [c for c in cards if not c["dedup"]]
  assert [c["donIndex"] for c in unique] == list(range(1, len(unique) + 1))

  ledger = {
    "sourcePdf": str(pdf_path),
    "sourceUrl": source_url,
    "pages": doc.page_count,
    "uniqueCards": len(unique),
    "labeledCards": sum(1 for c in unique if c["labelJa"]),
    "codedCards": sum(1 for c in unique if c["productCode"]),
    "codeCounts": dict(Counter(c["productCode"] for c in unique if c["productCode"])),
    "inCatalogue": False,
    "identity": {
      "primary": "donIndex = 1-based unique face order in official JP PDF (LTR, TTB)",
      "secondary": "labelJa = product caption under face (stacked lines joined)",
      "productCode": "from 【CODE】 in caption (OP-*, ST-*, PRB-*, EB-*)",
      "note": "No Bandai SET-NNN for DON!!. Catalogue seed is a separate step.",
    },
    "cards": unique,
  }
  (out / "ledger.json").write_text(
    json.dumps(ledger, ensure_ascii=False, indent=2), encoding="utf-8"
  )
  (out / "cards.json").write_text(
    json.dumps(unique, ensure_ascii=False, indent=2), encoding="utf-8"
  )
  rows = ["# | page/slot | code | label | file"]
  for c in unique:
    rows.append(
      f"{c['donIndex']:03d} | p{c['page']}s{c['slot']} | {c['productCode'] or '-'} | {c['labelJa']} | {c['file']}"
    )
  (out / "INDEX.txt").write_text("\n".join(rows) + "\n", encoding="utf-8")
  return ledger


def main() -> None:
  ap = argparse.ArgumentParser(description=__doc__)
  ap.add_argument(
    "--pdf",
    type=Path,
    default=Path("data/onepiece/staging/don-cardlist-jp.pdf"),
  )
  ap.add_argument(
    "--out",
    type=Path,
    default=Path("data/onepiece/staging/don-cardlist-extract"),
  )
  ap.add_argument(
    "--source-url",
    default="https://www.onepiece-cardgame.com/pdf/don-cardlist.pdf",
  )
  args = ap.parse_args()
  args.out.mkdir(parents=True, exist_ok=True)
  ledger = extract(args.pdf, args.out, args.source_url)
  print(
    f"unique={ledger['uniqueCards']} labeled={ledger['labeledCards']} "
    f"coded={ledger['codedCards']} -> {args.out}"
  )
  print("codes:", ledger["codeCounts"])


if __name__ == "__main__":
  main()
