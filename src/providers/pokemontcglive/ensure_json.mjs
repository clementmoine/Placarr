#!/usr/bin/env node
/**
 * Ensure Pokémon generated JSON / synthetic kit files exist under `data/` when
 * missing. Dumpers overwrite these; they are gitignored. Empty defaults keep
 * foil meta loaders importable without a local dump.
 *
 * `cards.json` is deliberately absent: the per-print foil mapping moved to the
 * `card_foil` table in `data/pokemon/catalog.sqlite`.
 *
 * `full_foil_mask.webp` is a synthetic solid-white 64×64 fallback (Live empty
 * `maskTex`) — not an APK extract. Regenerated here so it is not curated.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const DEFAULTS = [
  ["data/pokemon/foil/materialSheets.json", "{}\n"],
  ["data/pokemon/foil/textureFlags.json", "{}\n"],
];

/** Solid white 64×64 WebP (RGB) — same bytes historically on disk. */
const FULL_FOIL_MASK_WEBP = Buffer.from(
  "UklGRiQAAABXRUJQVlA4TBcAAAAvP8APAAfQ//73v/8BICH8f69F9D/1AwA=",
  "base64",
);

for (const [destRel, body] of DEFAULTS) {
  const dest = path.join(root, destRel);
  if (fs.existsSync(dest)) continue;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, body);
  console.log(`pokemon:ensure ${destRel}`);
}

const maskRel = "data/pokemon/foil/full_foil_mask.webp";
const maskDest = path.join(root, maskRel);
if (!fs.existsSync(maskDest)) {
  fs.mkdirSync(path.dirname(maskDest), { recursive: true });
  fs.writeFileSync(maskDest, FULL_FOIL_MASK_WEBP);
  console.log(`pokemon:ensure ${maskRel}`);
}
