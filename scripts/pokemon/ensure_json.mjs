#!/usr/bin/env node
/**
 * Ensure Pokémon generated JSON exists under `data/` when missing.
 * Dumpers overwrite these; they are gitignored. Empty defaults keep
 * foil meta loaders importable without a local dump.
 *
 * `cards.json` is deliberately absent: the per-print foil mapping moved to the
 * `card_foil` table in `data/pokemon/catalog.sqlite`. A 10.7 MB static
 * import had put all 41 546 entries in the browser bundle, and webpack never
 * finished compiling. SQLite needs no stub — the lookups answer empty when no
 * dump is installed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const DEFAULTS = [
  ["data/pokemon/foil/materialSheets.json", "{}\n"],
  ["data/pokemon/foil/textureFlags.json", "{}\n"],
];

for (const [destRel, body] of DEFAULTS) {
  const dest = path.join(root, destRel);
  if (fs.existsSync(dest)) continue;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, body);
  console.log(`pokemon:ensure ${destRel}`);
}
