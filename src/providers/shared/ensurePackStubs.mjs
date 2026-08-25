#!/usr/bin/env node
/**
 * Ensure pack stub files exist under `data/` when missing (fresh clone,
 * postinstall). Dumpers overwrite these; they are gitignored. Empty defaults
 * keep foil meta loaders importable without a local dump.
 *
 * Single table per pack — replaces the per-provider `ensure_json.mjs` twins.
 * `PLACARR_DATA_DIR` overrides the data root (same override as
 * `src/lib/runtimeData.ts`, used by tests).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const dataRoot = process.env.PLACARR_DATA_DIR?.trim()
  ? path.resolve(process.env.PLACARR_DATA_DIR.trim())
  : path.join(root, "data");

/**
 * Solid white 64×64 WebP (RGB) — same bytes historically on disk. Synthetic
 * fallback (Live empty `maskTex`), not an APK extract; regenerated here so it
 * is not curated.
 */
const FULL_FOIL_MASK_WEBP = Buffer.from(
  "UklGRiQAAABXRUJQVlA4TBcAAAAvP8APAAfQ//73v/8BICH8f69F9D/1AwA=",
  "base64",
);

/** `[pack, path under data/, body]` — body: string or Buffer. */
const STUBS = [
  ["lorcana", "lorcana/foil/manifest.json", "{}\n"],
  [
    "lorcana",
    "lorcana/cards-index.json",
    `${JSON.stringify({ version: 1, pack: "lorcana", cards: {} }, null, 2)}\n`,
  ],
  ["pokemon", "pokemon/foil/materialSheets.json", "{}\n"],
  ["pokemon", "pokemon/foil/textureFlags.json", "{}\n"],
  // `cards.json` deliberately absent: the per-print foil mapping lives in the
  // `card_foil` table of `data/pokemon/catalog.sqlite`.
  ["pokemon", "pokemon/foil/full_foil_mask.webp", FULL_FOIL_MASK_WEBP],
];

for (const [pack, relUnderData, body] of STUBS) {
  const dest = path.join(dataRoot, relUnderData);
  if (fs.existsSync(dest)) continue;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, body);
  console.log(`${pack}:ensure data/${relUnderData}`);
}
