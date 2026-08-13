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
} from "@/effects/pokemon/liveCardsIndex";
import {
  LIVE_SET_NON_CATALOGUE,
  liveSetToTcgdexSets,
} from "@/effects/pokemon/setAliases";
import {
  paperBundleId,
  paperCard,
  resolveEffectForPrintKey,
} from "@/effects/pokemon/resolveEffect";
import { remapCollectorNumberForLive } from "@/effects/pokemon/collectorRemap";
import { liveSetCandidatesFromTcgdexSet } from "@/effects/pokemon/liveSetId";

// Server-side: installs the SQLite lookups over the client-safe stubs.
// Without it the pack answers empty and every audit reports zero.
import "@/effects/pokemon/cardFoilIndex";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const REPORT_PATH = path.join(
  ROOT,
  "data/pokemon/logs/tcgdex-live-card-join.json",
);

/**
 * Spot-checks that exercise the real product path (`resolveEffectForPrintKey`),
 * not a naive « card #1 exists on candidate stem » probe.
 *
 * ``expectLive: false`` = set absent from TCG Live (catalogue-only paper).
 */
const SEED_PRINT_KEYS: ReadonlyArray<{
  printKey: string;
  label: string;
  expectLive: boolean;
}> = [
  { printKey: "pokemon:bw10-001", label: "bw10", expectLive: true },
  { printKey: "pokemon:sv01-001", label: "sv01", expectLive: true },
  { printKey: "pokemon:sv03.5-001", label: "sv03.5", expectLive: true },
  // Shiny Vault: TCGdex SV# → Live table num (remap), not collector 1/6.
  { printKey: "pokemon:swsh4.5sv-SV001", label: "swsh4.5sv", expectLive: true },
  { printKey: "pokemon:sma-SV001", label: "sma", expectLive: true },
  { printKey: "pokemon:base1-004", label: "base1", expectLive: false },
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
  hits: number;
  notInLive: number;
  unexpectedMiss: number;
  details: Array<{
    label: string;
    printKey: string;
    status: "hit" | "not-in-live" | "unexpected-miss";
    bundle?: string;
  }>;
} {
  const details: Array<{
    label: string;
    printKey: string;
    status: "hit" | "not-in-live" | "unexpected-miss";
    bundle?: string;
  }> = [];
  let hits = 0;
  let notInLive = 0;
  let unexpectedMiss = 0;

  for (const seed of SEED_PRINT_KEYS) {
    const resolved = resolveEffectForPrintKey(seed.printKey, "holo", "fr");
    if (resolved) {
      hits += 1;
      details.push({
        label: seed.label,
        printKey: seed.printKey,
        status: "hit",
        bundle: resolved.bundle,
      });
      continue;
    }
    if (!seed.expectLive) {
      notInLive += 1;
      details.push({
        label: seed.label,
        printKey: seed.printKey,
        status: "not-in-live",
      });
      continue;
    }
    unexpectedMiss += 1;
    details.push({
      label: seed.label,
      printKey: seed.printKey,
      status: "unexpected-miss",
    });
  }

  return {
    seeds: SEED_PRINT_KEYS.map((s) => s.label),
    hits,
    notInLive,
    unexpectedMiss,
    details,
  };
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
      "Every Live std identity should join a TCGdex set (or be non-catalogue). true-orphan must stay 0. Seed checks use resolveEffectForPrintKey (real remap path).",
  };

  mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    `Live→TCGdex (sample FR std): joined=${liveToTcgdex.joined} trueOrphans=${liveToTcgdex.trueOrphans} noTcgdexSet=${liveToTcgdex.noTcgdexSet} dumpMiss=${liveToTcgdex.dumpMiss} nonCatalogue=${liveToTcgdex.nonCatalogue} / ${liveToTcgdex.sampled}`,
  );
  console.log(
    `TCGdex→Live (seed printKeys via resolveEffect): hits=${tcgdexToLive.hits} notInLive=${tcgdexToLive.notInLive} unexpectedMiss=${tcgdexToLive.unexpectedMiss}`,
  );
  for (const d of tcgdexToLive.details) {
    const extra = d.bundle ? ` → ${d.bundle}` : "";
    console.log(`  ${d.label} (${d.printKey}): ${d.status}${extra}`);
  }
  console.log(`Wrote ${REPORT_PATH}`);

  if (strict && (liveToTcgdex.trueOrphans > 0 || tcgdexToLive.unexpectedMiss > 0)) {
    return 2;
  }
  return 0;
}

if (process.argv[1] && path.basename(process.argv[1]).includes("audit_live_join")) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
