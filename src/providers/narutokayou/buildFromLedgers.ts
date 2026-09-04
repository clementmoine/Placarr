/**
 * Catalogue Kayou — narutocards.ca + capsulecorpgear + alertehit/narutodex.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import {
  readAlertehitImageIndex,
  readCapsulecorpgearChecklist,
} from "./kayouExternalCrawl";
import { enrichChecklistWithAlertehitFaces } from "./alertehitNarutodexParse";
import type {
  KayouChecklist,
  KayouChecklistCard,
  KayouChecklistSet,
} from "./kayouLedgerTypes";
import { canonicalizeKayouNumber } from "./kayouIdNormalize";
import { enrichChecklistWithOfficialFaces } from "./kayouOfficialFaces";
import { buildKayouOfficialChecklist } from "./kayouOfficialChecklist";
import { mergeKayouChecklists } from "./mergeKayouChecklists";
import { NARUTO_KAYOU_PACK_ID, narutoKayouCuratedDir } from "./pack";
import { kayouPrintKey } from "./printKey";

export type { KayouChecklistCard, KayouChecklistSet } from "./kayouLedgerTypes";

const NARUTOCARDS_CHECKLIST_FILE = "narutocards-kayou-checklist.json";

/** Titres EN — pages tracker en anglais. */
export const KAYOU_TITLE_LANG = "en";

export function narutocardsKayouChecklistPath(): string {
  return path.join(
    narutoKayouCuratedDir(),
    "sources",
    NARUTOCARDS_CHECKLIST_FILE,
  );
}

/** @deprecated use readNarutocardsKayouChecklist */
export function kayouChecklistPath(): string {
  return narutocardsKayouChecklistPath();
}

export function readNarutocardsKayouChecklist(): KayouChecklist {
  return JSON.parse(
    readFileSync(narutocardsKayouChecklistPath(), "utf8"),
  ) as KayouChecklist;
}

/** Merged catalogue used by the pack pipeline and face harvest. */
export function readKayouChecklist(): KayouChecklist {
  const primary = readNarutocardsKayouChecklist();
  const extras: Parameters<typeof mergeKayouChecklists>[1][] = [];
  const capsule = readCapsulecorpgearChecklist();
  if (capsule) extras.push({ ledger: capsule, source: "capsulecorpgear" });
  const official = buildKayouOfficialChecklist();
  if (official) extras.push({ ledger: official, source: "kayouofficial" });
  let merged =
    extras.length > 0
      ? mergeKayouChecklists(primary, ...extras)
      : primary;
  const alerte = readAlertehitImageIndex();
  if (alerte) merged = enrichChecklistWithAlertehitFaces(merged, alerte);
  return enrichChecklistWithOfficialFaces(merged);
}

export function kayouSetLabelFromLedger(setCode: string): string {
  const code = setCode.trim().toLowerCase();
  const hit = kayouSetLabelMap().get(code);
  if (!hit) return setCode.trim().toUpperCase();
  return hit.replace(/^KAYOU\s+/i, "").trim() || hit;
}

let cachedLabels: Map<string, string> | null = null;
function kayouSetLabelMap(): Map<string, string> {
  if (cachedLabels) return cachedLabels;
  cachedLabels = new Map(
    readKayouChecklist().sets.map((s) => [
      s.code.trim().toLowerCase(),
      s.label,
    ]),
  );
  return cachedLabels;
}

export type KayouLedgerBuildReport = {
  rows: number;
  prints: number;
  titles: number;
  skipped: string[];
};

export function buildKayouFromLedgers(
  opts: {
    dryRun?: boolean;
    index?: ReturnType<typeof createLocalPrintsIndex>;
  } = {},
): KayouLedgerBuildReport {
  const ledger = readKayouChecklist();
  const skipped: string[] = [];
  const rows = [];

  for (const set of ledger.sets) {
    const setCode = set.code.trim().toLowerCase();
    for (const card of set.cards) {
      const number = canonicalizeKayouNumber(card.number.trim().toLowerCase());
      const name = card.name.trim();
      const printKey = kayouPrintKey(setCode, number);
      if (!printKey || !name) {
        skipped.push(`${set.slug}:${card.printed}`);
        continue;
      }
      rows.push({
        printKey,
        setCode,
        number,
        cardType: setCode,
        sourceUrl: set.url,
        titles: [
          {
            lang: KAYOU_TITLE_LANG,
            fullName: name,
            rarity: card.rarity?.trim() || null,
          },
        ],
      });
    }
  }

  const report: KayouLedgerBuildReport = {
    rows: ledger.sets.reduce((n, s) => n + s.cards.length, 0),
    prints: rows.length,
    titles: rows.length,
    skipped,
  };
  if (opts.dryRun) return report;

  const index = opts.index ?? createLocalPrintsIndex(NARUTO_KAYOU_PACK_ID);
  index.writePrints(rows);
  return report;
}
