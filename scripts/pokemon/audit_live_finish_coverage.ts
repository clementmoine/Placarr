/**
 * Structural audit: Live foil rows that catalogue finishes cannot select.
 *
 * For each FR dump entry, ask whether `holo` / `reverse` / `firstedition` /
 * `wpromo` alone would cover every foil Live key. Dual-foil dumps where the
 * catalogue typically lists only one finish are the risk surface that
 * `live-std` / `live-ph` synthesizes.
 *
 *   tsx scripts/pokemon/audit_live_finish_coverage.ts
 *   tsx scripts/pokemon/audit_live_finish_coverage.ts -- --strict
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LIVE_SET_NON_CATALOGUE,
} from "../../src/effects/pokemon/setAliases";
import {
  isPaperFoilVariant,
  listPaperBundleIds,
  paperCard,
  type PaperCardEntry,
} from "../../src/effects/pokemon/resolveEffect";
import {
  unreachableLiveKeys,
} from "../../src/effects/pokemon/liveFinishVariants";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REPORT_PATH = path.join(
  ROOT,
  "data/pokemon/logs/live-finish-coverage.json",
);

function parseArgs(argv: string[]) {
  let strict = false;
  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--strict") strict = true;
  }
  return { strict };
}

function liveSetFromBundle(bundle: string): string {
  return bundle.split("_")[0] ?? bundle;
}

function foilKeys(entry: PaperCardEntry): Array<"std" | "ph"> {
  const keys: Array<"std" | "ph"> = [];
  for (const key of ["std", "ph"] as const) {
    if (isPaperFoilVariant(entry[key])) keys.push(key);
  }
  return keys;
}

function main() {
  const { strict } = parseArgs(process.argv.slice(2));
  const bundles = listPaperBundleIds().filter((id) => /_fr_/i.test(id));

  let foilRows = 0;
  let dualFoil = 0;
  let nonCatalogue = 0;
  /** Dual-foil rows where holo alone cannot reach ph (needs live-ph or reverse). */
  let holoOnlyMissesPh = 0;
  /** Dual-foil rows where reverse alone cannot reach std (needs live-std or holo). */
  let reverseOnlyMissesStd = 0;
  const samples: {
    bundle: string;
    foil: Array<"std" | "ph">;
    holoUnreachable: Array<"std" | "ph">;
  }[] = [];

  for (const bundle of bundles) {
    const entry = paperCard(bundle);
    if (!entry) continue;
    const keys = foilKeys(entry);
    if (keys.length === 0) continue;
    foilRows += 1;

    const set = liveSetFromBundle(bundle);
    if (LIVE_SET_NON_CATALOGUE.has(set)) {
      nonCatalogue += 1;
      continue;
    }

    if (keys.length === 2) {
      dualFoil += 1;
      const holoGap = unreachableLiveKeys(entry, ["holo"]);
      if (holoGap.includes("ph")) {
        holoOnlyMissesPh += 1;
        if (samples.length < 25) {
          samples.push({
            bundle,
            foil: keys,
            holoUnreachable: holoGap,
          });
        }
      }
      if (unreachableLiveKeys(entry, ["reverse"]).includes("std")) {
        reverseOnlyMissesStd += 1;
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    frBundles: bundles.length,
    foilRows,
    dualFoil,
    nonCatalogue,
    holoOnlyMissesPh,
    reverseOnlyMissesStd,
    samples,
  };

  mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log(`Live finish coverage (FR dump)`);
  console.log(`  Bundles:                 ${bundles.length}`);
  console.log(`  Foil rows:               ${foilRows}`);
  console.log(`  Dual-foil:               ${dualFoil}`);
  console.log(`  Non-catalogue:           ${nonCatalogue}`);
  console.log(`  Holo-only misses ph:     ${holoOnlyMissesPh}`);
  console.log(`  Reverse-only misses std: ${reverseOnlyMissesStd}`);
  console.log(`  Report: ${path.relative(ROOT, REPORT_PATH)}`);
  if (samples.length) {
    console.log(`  Samples (holo→miss ph):`);
    for (const s of samples.slice(0, 8)) {
      console.log(`    ${s.bundle} foil=[${s.foil}] gap=[${s.holoUnreachable}]`);
    }
  }

  if (strict && !existsSync(path.join(ROOT, "src/effects/pokemon/cards.json"))) {
    console.error("strict: cards.json missing");
    process.exit(1);
  }
}

main();
