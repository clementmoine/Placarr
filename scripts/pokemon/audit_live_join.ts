/**
 * Card-level Live ↔ TCGdex join audit (anti-orphans).
 *
 * Bidirectional:
 * - Live std bundles → reachable TCGdex printKey (alias+num or classified)
 * - Sample TCGdex seed sets → Live hit via set+num / name / miss
 *
 *   tsx scripts/pokemon/audit_live_join.ts
 *   tsx scripts/pokemon/audit_live_join.ts -- --strict
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import {
  liveCardsDbPath,
  liveCardsIndexAvailable,
} from "../../src/effects/pokemon/liveCardsIndex";
import {
  LIVE_SET_NON_CATALOGUE,
  liveSetToTcgdexSets,
} from "../../src/effects/pokemon/setAliases";
import {
  paperBundleId,
  paperCard,
} from "../../src/effects/pokemon/resolveEffect";
import { remapCollectorNumberForLive } from "../../src/effects/pokemon/collectorRemap";
import { liveSetCandidatesFromTcgdexSet } from "../../src/effects/pokemon/liveSetId";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REPORT_PATH = path.join(
  ROOT,
  "data/pokemon/logs/tcgdex-live-card-join.json",
);

const SEED_TCGDEX_SETS = [
  "bw10",
  "sv01",
  "sv03.5",
  "swsh4.5sv",
  "sma",
  "base1",
];

type LiveOrphanStatus =
  | "joined"
  | "non-catalogue"
  | "no-tcgdex-set"
  | "dump-miss"
  | "true-orphan";

function parseArgs(argv: string[]) {
  let strict = false;
  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--strict") strict = true;
  }
  return { strict };
}

function auditLiveToTcgdex(): {
  sampled: number;
  joined: number;
  nonCatalogue: number;
  noTcgdexSet: number;
  dumpMiss: number;
  trueOrphans: number;
  orphanSamples: { bundle: string; status: LiveOrphanStatus }[];
} {
  const dbPath = liveCardsDbPath();
  if (!existsSync(dbPath)) {
    return {
      sampled: 0,
      joined: 0,
      nonCatalogue: 0,
      noTcgdexSet: 0,
      dumpMiss: 0,
      trueOrphans: 0,
      orphanSamples: [],
    };
  }
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const rows = db
    .prepare(
      `SELECT bundle_stem, live_set, num, name_en, name_fr
       FROM live_cards WHERE variant = 'std' AND lang = 'fr'
       ORDER BY live_set, num`,
    )
    .all() as {
    bundle_stem: string;
    live_set: string;
    num: number;
    name_en: string | null;
    name_fr: string | null;
  }[];

  const reverse = liveSetToTcgdexSets();
  let joined = 0;
  let nonCatalogue = 0;
  let noTcgdexSet = 0;
  let dumpMiss = 0;
  let trueOrphans = 0;
  const orphanSamples: { bundle: string; status: LiveOrphanStatus }[] = [];

  for (const row of rows) {
    const stem = row.live_set;
    if (LIVE_SET_NON_CATALOGUE.has(stem) || stem.endsWith("alt")) {
      nonCatalogue += 1;
      continue;
    }
    const tcgdexSets = reverse.get(stem) ?? [];
    // Mechanical: many Live stems equal normalized TCGdex ids (sv1 ↔ sv01 via candidates).
    const candidates = tcgdexSets.length > 0 ? tcgdexSets : [stem];
    if (tcgdexSets.length === 0) {
      // Still try stem as TCGdex-like id via liveSetCandidates reverse by probing dump.
    }
    let ok = false;
    for (const tid of candidates) {
      const liveNum = remapCollectorNumberForLive(tid, String(row.num));
      if (!liveNum) continue;
      for (const live of liveSetCandidatesFromTcgdexSet(tid)) {
        const bundle = paperBundleId(live, liveNum, "fr");
        if (bundle && paperCard(bundle)) {
          ok = true;
          break;
        }
      }
      if (ok) break;
      // Direct: Live stem itself as candidate set id
      const direct = paperBundleId(stem, row.num, "fr");
      if (direct && paperCard(direct)) {
        ok = true;
        break;
      }
    }
    if (ok) {
      joined += 1;
      continue;
    }
    if (paperCard(row.bundle_stem)) {
      if (tcgdexSets.length === 0) {
        noTcgdexSet += 1;
        if (orphanSamples.length < 40) {
          orphanSamples.push({
            bundle: row.bundle_stem,
            status: "no-tcgdex-set",
          });
        }
      } else {
        trueOrphans += 1;
        if (orphanSamples.length < 40) {
          orphanSamples.push({
            bundle: row.bundle_stem,
            status: "true-orphan",
          });
        }
      }
    } else {
      dumpMiss += 1;
      if (orphanSamples.length < 40) {
        orphanSamples.push({ bundle: row.bundle_stem, status: "dump-miss" });
      }
    }
  }

  return {
    sampled: rows.length,
    joined,
    nonCatalogue,
    noTcgdexSet,
    dumpMiss,
    trueOrphans,
    orphanSamples,
  };
}

function auditTcgdexSeedsToLive(): {
  seeds: string[];
  setnumHits: number;
  misses: number;
} {
  let setnumHits = 0;
  let misses = 0;
  for (const tid of SEED_TCGDEX_SETS) {
    const lives = liveSetCandidatesFromTcgdexSet(tid);
    const any =
      lives.some((live) => paperCard(paperBundleId(live, 1, "fr") ?? "")) ||
      lives.some((live) => paperCard(paperBundleId(live, 6, "fr") ?? ""));
    if (any) setnumHits += 1;
    else misses += 1;
  }
  return { seeds: SEED_TCGDEX_SETS, setnumHits, misses };
}

async function main(argv: string[]): Promise<number> {
  const { strict } = parseArgs(argv);
  const liveToTcgdex = auditLiveToTcgdex();
  const tcgdexToLive = auditTcgdexSeedsToLive();

  const report = {
    finishedAt: new Date().toISOString(),
    liveCardsSqlite: liveCardsIndexAvailable(),
    liveToTcgdex,
    tcgdexToLive,
    policy:
      "Every Live std identity should join a TCGdex set (or be non-catalogue). true-orphan must stay 0.",
  };

  mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    `Live→TCGdex: joined=${liveToTcgdex.joined} orphans=${liveToTcgdex.trueOrphans} noSet=${liveToTcgdex.noTcgdexSet} dumpMiss=${liveToTcgdex.dumpMiss} nonCat=${liveToTcgdex.nonCatalogue} / ${liveToTcgdex.sampled}`,
  );
  console.log(
    `TCGdex seeds→Live: hits=${tcgdexToLive.setnumHits} miss=${tcgdexToLive.misses}`,
  );
  console.log(`Wrote ${REPORT_PATH}`);

  if (strict && liveToTcgdex.trueOrphans > 0) return 2;
  return 0;
}

if (process.argv[1] && path.basename(process.argv[1]).includes("audit_live_join")) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
