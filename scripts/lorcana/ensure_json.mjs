#!/usr/bin/env node
/**
 * Ensure Lorcana generated JSON exists (copy from *.stub.json when missing).
 * Dumpers overwrite these; they are gitignored. Stubs keep build/vitest
 * importable without a local dump.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const COPIES = [
  ["src/effects/lorcana/manifest.stub.json", "src/effects/lorcana/manifest.json"],
  [
    "src/effects/lorcana/cards-index.stub.json",
    "src/effects/lorcana/cards-index.json",
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
  console.log(`lorcana:ensure ${destRel}`);
}
