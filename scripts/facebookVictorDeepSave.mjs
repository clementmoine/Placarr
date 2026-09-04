/** Append Victor deep-extract record to staging jsonl. */
import { appendFileSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const outDir = path.resolve(
  "data/naruto/carddass/staging/facebook-naruto-collection-france",
);
mkdirSync(outDir, { recursive: true });

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("usage: facebookVictorDeepSave.mjs <extract-json-file>");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(inputPath, "utf8"));
const payload =
  typeof raw.result?.value === "string"
    ? JSON.parse(raw.result.value)
    : raw.result?.value ?? raw;

appendFileSync(
  path.join(outDir, "victor-deep-2026-09-02.jsonl"),
  `${JSON.stringify({ crawledAt: new Date().toISOString(), ...payload })}\n`,
);
console.log(`saved ${payload.permalink ?? payload.id ?? "?"} len=${(payload.text ?? "").length}`);
