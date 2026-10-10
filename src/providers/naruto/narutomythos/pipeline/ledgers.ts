/**
 * Catalogue Mythos — checklist officielle CICABOOM en priorité,
 * LorenZone en secours si l’API n’a pas encore été harvestée.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { NARUTO_MYTHOS_PACK_ID, narutoMythosCuratedDir } from "../pack";
import {
  NARUTO_MYTHOS_KS1_SET_CODE,
  NARUTO_MYTHOS_KS1E2_SET_CODE,
  NARUTO_MYTHOS_KS1PROMO_SET_CODE,
  mythosPrintKey,
} from "../printKey";

export type MythosChecklistCard = {
  printed: string;
  number: string;
  grouping: string | null;
  name: string;
  /** Present on official multi-lang checklist; absent on LorenZone. */
  titles?: { lang: string; fullName: string }[];
  rarity: string | null;
  faceUrl?: string | null;
  note?: string;
};

export type MythosChecklist = {
  source: string;
  url: string;
  set: { code: string; label?: string; denominator?: number };
  cards: MythosChecklistCard[];
  note?: string;
};

const LORENZONE_FILES = [
  "lorenzone-ks1-checklist.json",
  "lorenzone-ss2-checklist.json",
] as const;

const OFFICIAL_CHECKLIST = "narutotcgmythos-checklist.json";

/** Prefer FR when a single-lang fallback title is needed (LorenZone). */
export const MYTHOS_TITLE_LANG = "fr";

export function mythosChecklistPath(
  file: string = LORENZONE_FILES[0],
): string {
  return path.join(narutoMythosCuratedDir(), "sources", file);
}

export function mythosOfficialChecklistPath(): string {
  return mythosChecklistPath(OFFICIAL_CHECKLIST);
}

export function readMythosChecklist(
  file: string = LORENZONE_FILES[0],
): MythosChecklist {
  return JSON.parse(
    readFileSync(mythosChecklistPath(file), "utf8"),
  ) as MythosChecklist;
}

function officialAsChecklists(): MythosChecklist[] {
  const p = mythosOfficialChecklistPath();
  if (!existsSync(p)) return [];
  const raw = JSON.parse(readFileSync(p, "utf8")) as {
    sets?: {
      code: string;
      label?: string;
      cards: MythosChecklistCard[];
    }[];
  };
  return (raw.sets ?? []).map((set) => ({
    source: "cards.narutotcgmythos.com",
    url: "https://www.narutotcgmythos.com/fr/galerie",
    set: { code: set.code, label: set.label },
    cards: set.cards,
  }));
}

function lorenzoneChecklists(): MythosChecklist[] {
  return LORENZONE_FILES.flatMap((file) => {
    const p = mythosChecklistPath(file);
    if (!existsSync(p)) return [];
    return [readMythosChecklist(file)];
  });
}

function isComingSoonTitle(name: string): boolean {
  return /^coming\s*soon$/i.test(name.trim());
}

/**
 * LorenZone cards absent from CICABOOM — Legendary `lg*`, SG, chibi SS2…
 * Skip « Coming Soon », shop mis-keys (bare # already in API under S/SV/H),
 * and Mythos V already filed under `ks1promo` / `ks1e2`.
 */
export function lorenzoneChecklistSupplement(
  official: readonly MythosChecklist[],
): MythosChecklist[] {
  const offKeys = new Set<string>();
  const offNumbers = new Set<string>();
  for (const ledger of official) {
    const setCode = ledger.set?.code?.trim().toLowerCase() || "";
    for (const card of ledger.cards) {
      const number = card.number.trim().toLowerCase();
      const grouping = card.grouping?.trim().toLowerCase() || null;
      const printKey = mythosPrintKey(setCode, number, grouping);
      if (printKey) offKeys.add(printKey);
      offNumbers.add(`${setCode}|${number}`);
    }
  }

  const out: MythosChecklist[] = [];
  for (const ledger of lorenzoneChecklists()) {
    const setCode =
      ledger.set?.code?.trim().toLowerCase() || NARUTO_MYTHOS_KS1_SET_CODE;
    const cards = ledger.cards.filter((card) => {
      if (isComingSoonTitle(card.name)) return false;
      const number = card.number.trim().toLowerCase();
      const grouping = card.grouping?.trim().toLowerCase() || null;
      const printKey = mythosPrintKey(setCode, number, grouping);
      if (!printKey || offKeys.has(printKey)) return false;

      // Missions: official uses mss*; ignore LorenZone M1… duplicates.
      if (/^m\d+$/.test(number)) return false;

      // Mythos V already on promo / 2e éd. — don't re-home on ks1.
      if (grouping === "v" || grouping === "sv") {
        for (const alt of [
          NARUTO_MYTHOS_KS1PROMO_SET_CODE,
          NARUTO_MYTHOS_KS1E2_SET_CODE,
        ]) {
          const altKey = mythosPrintKey(alt, number, grouping);
          if (altKey && offKeys.has(altKey)) return false;
        }
      }

      // Bare collector already in the API under another finish → shop mis-key.
      if (!grouping && offNumbers.has(`${setCode}|${number}`)) return false;

      // Only keep clear catalogue holes (Legendary, SG, chibi, …).
      const isLegendary = number.startsWith("lg");
      const isParallel =
        grouping === "sg" ||
        grouping === "chibi" ||
        grouping === "pop" ||
        grouping === "shinobi";
      if (!isLegendary && !isParallel) return false;

      return true;
    });
    if (!cards.length) continue;
    out.push({
      ...ledger,
      cards,
      note: "LorenZone — absents de l’API CICABOOM (lg / SG / chibi…).",
    });
  }
  return out;
}

/** Officiel CICABOOM + complément LorenZone (trous réels) ; sinon LorenZone seul. */
export function readAllMythosChecklists(): MythosChecklist[] {
  const official = officialAsChecklists();
  if (official.length) {
    return [...official, ...lorenzoneChecklistSupplement(official)];
  }
  return lorenzoneChecklists();
}

export type MythosLedgerBuildReport = {
  rows: number;
  prints: number;
  titles: number;
  skipped: string[];
  sets: string[];
  /** Anciens placeholders « Coming Soon » retirés (twin déjà sous ks1promo). */
  prunedComingSoon?: string[];
  /** PrintKeys hors checklists (ex. CFA/CH ScanFlip mintés en `-a`/`-chibi`). */
  prunedUnattested?: string[];
};

/** Clés CICABOOM + complément LorenZone — seule source de vérité catalogue. */
export function attestedMythosPrintKeys(): Set<string> {
  const keys = new Set<string>();
  for (const ledger of readAllMythosChecklists()) {
    const setCode =
      ledger.set?.code?.trim().toLowerCase() || NARUTO_MYTHOS_KS1_SET_CODE;
    for (const card of ledger.cards) {
      const printKey = mythosPrintKey(
        setCode,
        card.number,
        card.grouping,
      );
      if (printKey) keys.add(printKey);
    }
  }
  return keys;
}

/**
 * Retire les tirages absents des checklists (fantômes ScanFlip CFA→`-a`,
 * CH→`-chibi`, V re-homés sur `ks1` alors que l’officiel est `ks1promo`…).
 * `writePrints` upsert only — without this, ghosts accumulate forever.
 */
export function pruneMythosUnattestedPrints(
  index: ReturnType<typeof createLocalPrintsIndex>,
): string[] {
  const attested = attestedMythosPrintKeys();
  const db = index.openForWrite();
  const rows = db
    .prepare(
      `SELECT print_key AS printKey FROM prints`,
    )
    .all() as Array<{ printKey: string }>;

  const removed: string[] = [];
  const del = db.prepare(`DELETE FROM prints WHERE print_key = ?`);
  for (const row of rows) {
    if (attested.has(row.printKey)) continue;
    del.run(row.printKey);
    removed.push(row.printKey);
  }
  return removed;
}

/**
 * Retire les stubs LorenZone « Coming Soon » restés sur `ks1` une fois le
 * vrai Mythos V sous `ks1promo` (ou `ks1e2`). Sinon l'export laisse 3 tuiles
 * sans image dans le catalogue.
 */
export function pruneMythosComingSoonPlaceholders(
  index: ReturnType<typeof createLocalPrintsIndex>,
): string[] {
  const db = index.openForWrite();
  const rows = db
    .prepare(
      `SELECT p.print_key AS printKey, p.number, p.grouping
         FROM prints p
         JOIN print_titles t ON t.print_key = p.print_key
        WHERE LOWER(p.set_code) = ?
          AND LOWER(TRIM(t.full_name)) = 'coming soon'`,
    )
    .all(NARUTO_MYTHOS_KS1_SET_CODE) as Array<{
    printKey: string;
    number: string;
    grouping: string | null;
  }>;

  const removed: string[] = [];
  const del = db.prepare(`DELETE FROM prints WHERE print_key = ?`);
  for (const row of rows) {
    const number = String(row.number ?? "").trim().toLowerCase();
    const grouping = row.grouping?.trim().toLowerCase() || null;
    let twin: string | null = null;
    for (const alt of [
      NARUTO_MYTHOS_KS1PROMO_SET_CODE,
      NARUTO_MYTHOS_KS1E2_SET_CODE,
    ]) {
      const key = mythosPrintKey(alt, number, grouping);
      if (!key) continue;
      const hit = db
        .prepare(`SELECT 1 AS ok FROM prints WHERE print_key = ? LIMIT 1`)
        .get(key) as { ok?: number } | undefined;
      if (hit?.ok) {
        twin = key;
        break;
      }
    }
    if (!twin) continue;
    del.run(row.printKey);
    removed.push(row.printKey);
  }
  return removed;
}

export function buildMythosFromLedgers(
  opts: {
    dryRun?: boolean;
    index?: ReturnType<typeof createLocalPrintsIndex>;
  } = {},
): MythosLedgerBuildReport {
  const ledgers = readAllMythosChecklists();
  const skipped: string[] = [];
  const rows = [];
  const sets = new Set<string>();

  for (const ledger of ledgers) {
    const setCode =
      ledger.set?.code?.trim().toLowerCase() || NARUTO_MYTHOS_KS1_SET_CODE;
    sets.add(setCode);
    const fallbackLang = setCode === "ss2" ? "en" : MYTHOS_TITLE_LANG;

    for (const card of ledger.cards) {
      const number = card.number.trim().toLowerCase();
      const grouping = card.grouping?.trim().toLowerCase() || null;
      const name = card.name.trim();
      const printKey = mythosPrintKey(setCode, number, grouping);
      if (!printKey || !name) {
        skipped.push(`${setCode}:${card.printed}`);
        continue;
      }
      const rarity = card.rarity?.trim() || null;
      const titles =
        card.titles?.length &&
        card.titles.some((t) => t.fullName?.trim())
          ? card.titles
              .filter((t) => t.fullName?.trim())
              .map((t) => ({
                lang: t.lang.trim().toLowerCase(),
                fullName: t.fullName.trim(),
                rarity,
              }))
          : [
              {
                lang: fallbackLang,
                fullName: name,
                rarity,
              },
            ];
      rows.push({
        printKey,
        setCode,
        number,
        cardType: setCode,
        grouping,
        sourceUrl: ledger.url,
        titles,
      });
    }
  }

  const report: MythosLedgerBuildReport = {
    rows: ledgers.reduce((n, l) => n + l.cards.length, 0),
    prints: rows.length,
    titles: rows.reduce((n, r) => n + r.titles.length, 0),
    skipped,
    sets: [...sets].sort(),
  };
  if (opts.dryRun) return report;

  const index = opts.index ?? createLocalPrintsIndex(NARUTO_MYTHOS_PACK_ID);
  index.writePrints(rows);
  const pruned = pruneMythosComingSoonPlaceholders(index);
  if (pruned.length) report.prunedComingSoon = pruned;
  const prunedGhosts = pruneMythosUnattestedPrints(index);
  if (prunedGhosts.length) report.prunedUnattested = prunedGhosts;
  return report;
}
