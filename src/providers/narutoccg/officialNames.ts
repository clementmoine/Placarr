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

import { narutoLedgerNumber } from "./collectorIdentity";
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

/**
 * Suffixes qui désignent une **autre carte**, pas une réimpression.
 *
 * Le bonus de précommande du jeu PlayStation « 忍の里の陣取り合戦 » (2003) porte
 * les numéros 忍-1/2/3/11 avec une **illustration inédite** — la page de Bandai
 * dit `書き下ろしイラスト`, et notre registre le note explicitement
 * `not: ["reimpression-de-忍-1"]`. Ces quatre cartes ne sont jamais sorties
 * hors du Japon.
 *
 * Le nom officiel se cherche par numéro, suffixe retiré. Pour un `-promo` c'est
 * juste : un retirage marqué PROMO est bien la même carte. Pour `-ps` c'est
 * faux, et ça leur collait le nom **français** de la carte de base — « Naruto
 * Uzumaki » sur une carte qu'aucun francophone n'a jamais pu tenir.
 */
const NEW_ARTWORK_GROUPINGS = new Set(["ps"]);

/**
 * `naruto:s5-ni232` → `ni232`, suffixe retiré pour aller chercher le nom
 * officiel de la carte de base.
 *
 * Rend `null` quand le suffixe dit qu'il ne **s'agit pas** de cette carte :
 * l'appelant n'a alors rien à chercher, plutôt qu'un nom emprunté.
 */
export function collectorNumberOf(print: NarutoPrintRow): string | null {
  const raw =
    narutoLedgerNumber(print.number) ?? String(print.number).toLowerCase();
  const grouping = /-([a-z0-9]+)$/i.exec(raw)?.[1]?.toLowerCase();
  if (grouping && NEW_ARTWORK_GROUPINGS.has(grouping)) return null;
  return raw.replace(/-.*$/, "").toLowerCase();
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
    /*
      `null` = ce tirage n'est pas la carte de base, malgré le numéro partagé.
      Rien à emprunter : sans ça, les quatre 忍-n（PS） recevaient le nom
      français de la carte qu'elles ne sont pas.
    */
    const number = collectorNumberOf(print);
    if (!number) continue;
    const hit = official.get(number);
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
