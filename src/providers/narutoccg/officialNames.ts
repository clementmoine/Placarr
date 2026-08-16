/**
 * Official FR card names, from
 * `src/providers/narutoccg/curated/sources/carddass-card-names.json`.
 *
 * They take precedence over the Manga-News cache, which is a community
 * checklist that truncates long names at ~24 characters ("Pouvoir de la marque
 * mal…") and carries a few misreadings. The official file merges carddass.fr's
 * own "liste des cartes" pages with the transcribed printed checklists, and
 * arbitrates the divergences case by case.
 *
 * It is not blindly authoritative either: the printed checklist prints
 * "Temari" where card NI-150 reads SAKON, so a handful of entries are resolved
 * against the card itself. See `printedChecklistErrata` in the source file.
 *
 * Manga-News still fills what the official sources never named — Série 06 and
 * the promos, for which no checklist has ever existed.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { narutoCuratedSourcesDir } from "./curatedPaths";
import { type NarutoPrintRow, type NarutoTitleRow } from "./indexStore";

type OfficialCard = {
  name: string;
  rarity?: string | null;
  serie?: number | null;
  source?: string;
};

export type OfficialNames = Map<string, OfficialCard>;

function sourcesFile(): string {
  return path.join(narutoCuratedSourcesDir(), "carddass-card-names.json");
}

/** Keyed by collector number (`ni232`). Empty when the file is absent. */
export function loadOfficialNames(): OfficialNames {
  const file = sourcesFile();
  if (!existsSync(file)) return new Map();
  const doc = JSON.parse(readFileSync(file, "utf8")) as {
    cards?: Record<string, OfficialCard>;
  };
  return new Map(Object.entries(doc.cards ?? {}));
}

/** `naruto:s5-ni232` → `ni232`; promos keep their `-cdf` suffix off. */
export function collectorNumberOf(print: NarutoPrintRow): string {
  return String(print.number).replace(/-.*$/, "").toLowerCase();
}

/**
 * Overlay official names on top of whatever the community cache produced.
 * A community title is kept only when no official name exists for that number.
 */
export function applyOfficialNames(
  prints: readonly NarutoPrintRow[],
  titles: readonly NarutoTitleRow[],
  official: OfficialNames,
): { titles: NarutoTitleRow[]; replaced: number; added: number } {
  const byKey = new Map(
    titles.map((t) => [`${t.printKey}|${t.lang}`, { ...t }]),
  );
  let replaced = 0;
  let added = 0;

  for (const print of prints) {
    const hit = official.get(collectorNumberOf(print));
    if (!hit?.name) continue;
    const key = `${print.printKey}|fr`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, {
        printKey: print.printKey,
        lang: "fr",
        fullName: hit.name,
        rarity: hit.rarity ?? null,
      });
      added += 1;
      continue;
    }
    if (prev.fullName !== hit.name) {
      prev.fullName = hit.name;
      replaced += 1;
    }
    if (!prev.rarity && hit.rarity) prev.rarity = hit.rarity;
  }

  return { titles: [...byKey.values()], replaced, added };
}
