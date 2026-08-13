#!/usr/bin/env node
/**
 * Ensure Lorcana generated JSON exists under `data/` when missing.
 * Dumpers overwrite these; they are gitignored. Empty defaults keep
 * foil meta loaders importable without a local dump.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const DEFAULTS = [
  ["data/lorcana/foil/manifest.json", "{}\n"],
  [
    "data/lorcana/cards-index.json",
    `${JSON.stringify({ version: 1, pack: "lorcana", cards: {} }, null, 2)}\n`,
  ],
];

for (const [destRel, body] of DEFAULTS) {
  const dest = path.join(root, destRel);
  if (fs.existsSync(dest)) continue;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, body);
  console.log(`lorcana:ensure ${destRel}`);
}
