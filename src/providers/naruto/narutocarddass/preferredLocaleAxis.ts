/**
 * Carddass preferred-lang axis + browse locales — lives on the provider,
 * not in admin.
 *
 * JA ↔ 巻ノ, FR/IT ↔ Carddass EU, EN ↔ CCG. Blocks hung JA shop scans on
 * EU-only printKeys and CCG `N-013` Coleka FR shells next to Carddass
 * `NI-013` on S1. « Toutes locales » still lists all (caller skips this).
 */

/**
 * Admin browse surface — measured corpus langs.
 * Kept off {@link cataloguePackInfo}.catalogueLocales so materialize does not
 * invent empty FR shells for EN-only CCG printKeys.
 */
export const CARDDASS_CATALOGUE_BROWSE_LOCALES = [
  "en",
  "fr",
  "it",
  "ja",
] as const;
import {
  canonicalizeNarutoPrintKey,
  isJpOnlyNarutoArtwork,
  isNarutoCatalogueSetCode,
  isNarutoJapaneseVolumeSet,
} from "./identity";
import { narutoCatalogueLineForCard } from "./packs";
import { belongsOnNarutoPromoChecklist } from "./sources/promos";

/** Minimal row shape — avoids coupling the pack registry to CatalogueCardRow. */
export type PreferredLocaleAxisRow = {
  kind?: string;
  printKey: string;
  set: string;
  card: string;
  appearanceSets?: readonly string[];
};

function narutoPrintKeySetCode(printKey: string): string | null {
  const canon = canonicalizeNarutoPrintKey(printKey);
  const m = /^naruto:([a-z0-9]+)-/i.exec(canon);
  if (!m) return null;
  const set = m[1]!.toLowerCase();
  return isNarutoCatalogueSetCode(set) ? set : null;
}

/** FR retail + late exceptions (S6 inserts, Rampage/s11, Sage's/s24, Storm3/s28). */
function isNarutoFrenchRetailSet(set: string): boolean {
  const id = set.trim().toLowerCase();
  if (id === "promo" || id === "prerelease") return true;
  const series = /^s(\d+)$/i.exec(id);
  if (!series) return false;
  const n = Number(series[1]);
  if (n <= 5) return true;
  return n === 6 || n === 11 || n === 24 || n === 28;
}

/** Italian Carddass retail = S1–S6 (+ promo / prerelease). */
function isNarutoItalianRetailSet(set: string): boolean {
  const id = set.trim().toLowerCase();
  if (id === "promo" || id === "prerelease") return true;
  const series = /^s(\d+)$/i.exec(id);
  return !!series && Number(series[1]) <= 6;
}

/** Late Bandai USA sets with Coleka FR titles (not Path of the Hokage s1–s6). */
function isNarutoFrenchColekaCcgSet(set: string): boolean {
  const m = /^s(\d+)$/i.exec(set.trim());
  if (!m) return false;
  const n = Number(m[1]);
  return n === 11 || n === 24 || n === 28;
}

export function matchesNarutoPreferredLocaleAxis(
  row: PreferredLocaleAxisRow,
  preferLang: string,
): boolean {
  if (row.kind === "back") return true;
  const want = preferLang.trim().toLowerCase();
  if (!want) return true;
  const sets =
    row.appearanceSets?.length
      ? [...row.appearanceSets]
      : ([narutoPrintKeySetCode(row.printKey)].filter(Boolean) as string[]);
  const line = narutoCatalogueLineForCard(
    row.card,
    sets[0] ?? narutoPrintKeySetCode(row.printKey) ?? undefined,
  );
  if (want === "ja") {
    if (isJpOnlyNarutoArtwork(row.card)) return true;
    return sets.some((set) => isNarutoJapaneseVolumeSet(set));
  }
  if (want === "fr") {
    if (!sets.length) return true;
    /*
      S1–S6 CCG (`N-013`) is English Bandai USA — Coleka FR titles must not sit
      beside Carddass `NI-013` (« Hokage le 3e »). Late CCG s11/s24/s28 keep FR.
    */
    if (line === "en-ccg") {
      return sets.some((set) => isNarutoFrenchColekaCcgSet(set));
    }
    if (
      sets.some((set) => set.toLowerCase() === "promo") &&
      !belongsOnNarutoPromoChecklist(row.card)
    ) {
      return false;
    }
    return sets.some((set) => isNarutoFrenchRetailSet(set));
  }
  if (want === "it") {
    if (line === "en-ccg") return false;
    if (!sets.length) return true;
    if (
      sets.some((set) => set.toLowerCase() === "promo") &&
      !belongsOnNarutoPromoChecklist(row.card)
    ) {
      return false;
    }
    return sets.some((set) => isNarutoItalianRetailSet(set));
  }
  if (want === "en") {
    // Preferred EN = CCG checklist, not Carddass NI/TE doubles.
    if (line === "carddass-fr") return false;
    if (!sets.length) return true;
    return sets.some((set) => !isNarutoJapaneseVolumeSet(set));
  }
  return true;
}
