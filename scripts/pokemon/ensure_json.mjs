#!/usr/bin/env node
/**
 * Ensure Pokémon generated JSON exists (copy from *.stub.json when missing).
 * Dumpers overwrite these; they are gitignored. Stubs keep build/vitest
 * importable without a local dump.
 *
 * `cards.json` is deliberately absent: the per-print foil mapping moved to the
 * `card_foil` table in `data/pokemon/live-cards.sqlite`. A 10.7 MB static
 * import had put all 41 546 entries in the browser bundle, and webpack never
 * finished compiling. SQLite needs no stub — the lookups answer empty when no
 * dump is installed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const COPIES = [
  [
    "src/effects/pokemon/materialSheets.stub.json",
    "src/effects/pokemon/materialSheets.json",
  ],
  [
    "src/effects/pokemon/textureFlags.stub.json",
    "src/effects/pokemon/textureFlags.json",
  ],
];

for (const [stubRel, destRel] of COPIES) {
  const stub = path.join(root, stubRel);
  const dest = path.join(root, destRel);
  if (fs.existsSync(dest)) continue;
  if (!fs.existsSync(stub)) {
    console.error(`missing stub: ${stubRel}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(stub, dest);
  console.log(`pokemon:ensure ${destRel}`);
}
