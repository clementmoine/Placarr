/**
 * Cartes S6 physiquement imprimées en français alors que le retail (boosters /
 * starters) a été annulé. Le registre `sets.json` reste `released: false`.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  appearanceSetsOf,
  appearanceValueForJson,
  mergeAppearanceValues,
  type NarutoLangAppearances,
} from "../appearanceSets";
import { narutoCollectorKey, narutoDiskCardId } from "../collectorIdentity";
import { narutoCuratedSourcesDir } from "../curatedPaths";

type S6FrPrintedFile = {
  retailFr?: boolean;
  cards?: readonly { number?: string }[];
  kanaBlisterS5Reprints?: readonly { number?: string }[];
};

type AppearancesFile = {
  generatedAt: string;
  appearances: Record<string, NarutoLangAppearances>;
};

let keys: Set<string> | null = null;
let diskNumbers: string[] | null = null;

/** Formes disque pour un id ledger (`ta221` → ta221 / ta0221 / …). */
function numberForms(id: string): string[] {
  const raw = id.trim().toLowerCase();
  const m = /^(ni|te|ta|cl|pr)(\d+)$/i.exec(raw);
  if (!m) return raw ? [raw] : [];
  const type = m[1]!.toLowerCase();
  const n = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(n) || n < 0) return [raw];
  return [
    ...new Set([
      `${type}${n}`,
      `${type}${String(n).padStart(3, "0")}`,
      `${type}${String(n).padStart(4, "0")}`,
    ]),
  ];
}

function loadFile(): S6FrPrintedFile {
  return JSON.parse(
    readFileSync(
      path.join(narutoCuratedSourcesDir(), "s6-fr-printed.json"),
      "utf8",
    ),
  ) as S6FrPrintedFile;
}

/** Inédites S6 + reprints S5 de l'opération manga Kana (15 tomes). */
function ledgerNumbers(file: S6FrPrintedFile): string[] {
  const out: string[] = [];
  for (const row of file.cards ?? []) {
    const n = row.number?.trim();
    if (n) out.push(n);
  }
  for (const row of file.kanaBlisterS5Reprints ?? []) {
    const n = row.number?.trim();
    if (n) out.push(n);
  }
  return out;
}

function loadKeys(): Set<string> {
  if (keys) return keys;
  const out = new Set<string>();
  try {
    for (const number of ledgerNumbers(loadFile())) {
      const key = narutoCollectorKey(number);
      if (key) out.add(key);
    }
  } catch {
    /* ledger absent */
  }
  keys = out;
  return out;
}

export function resetNarutoS6FrPrintedCache(): void {
  keys = null;
  diskNumbers = null;
}

export function narutoS6FrPrintedNumbers(): Set<string> {
  return loadKeys();
}

/** Formes `prints.number` / disque pour élargir la membership S6 FR. */
export function narutoS6FrPrintedDiskNumbers(): string[] {
  if (diskNumbers) return diskNumbers;
  const out = new Set<string>();
  try {
    for (const raw of ledgerNumbers(loadFile())) {
      if (!raw) continue;
      for (const form of numberForms(raw)) out.add(form.toLowerCase());
      const disk = narutoDiskCardId(raw);
      if (disk) out.add(disk.toLowerCase());
    }
  } catch {
    /* ledger absent */
  }
  diskNumbers = [...out];
  return diskNumbers;
}

export function isNarutoS6FrPrintedNumber(raw: string): boolean {
  const key = narutoCollectorKey(raw);
  return key != null && loadKeys().has(key);
}

/**
 * Opération manga Kana (15) + inédites DVD → `appearances.json` FR `s6`.
 * Les reprints gardent aussi `s5` (multi-set, comme NI-049).
 * @returns nombre de cartes FR dont la liste de sets a changé.
 */
export function syncNarutoS6FrPrintedAppearances(packRoot: string): number {
  const file = path.join(packRoot, "appearances.json");
  let appearances: Record<string, NarutoLangAppearances> = {};
  let generatedAt = new Date().toISOString();
  if (existsSync(file)) {
    try {
      const raw = JSON.parse(readFileSync(file, "utf8")) as AppearancesFile;
      appearances = { ...(raw.appearances ?? {}) };
      generatedAt = raw.generatedAt ?? generatedAt;
    } catch {
      /* rebuild */
    }
  }

  let changed = 0;
  try {
    for (const raw of ledgerNumbers(loadFile())) {
      if (!raw) continue;
      const diskId =
        narutoDiskCardId(raw) ??
        numberForms(raw).find((form) => /^[a-z]+\d{4}/.test(form)) ??
        numberForms(raw)[0];
      if (!diskId) continue;
      const langs = appearances[diskId] ?? {};
      const before = appearanceSetsOf(langs.fr).join(",");
      const merged = mergeAppearanceValues(langs.fr, "s6");
      langs.fr = appearanceValueForJson(merged);
      appearances[diskId] = langs;
      if (appearanceSetsOf(langs.fr).join(",") !== before) changed += 1;
    }
  } catch {
    return 0;
  }

  writeFileSync(
    file,
    `${JSON.stringify(
      {
        generatedAt,
        appearances,
      } satisfies AppearancesFile,
      null,
      2,
    )}\n`,
  );
  return changed;
}
