/**
 * Carddass materialize helpers — collapse + print-scoped faces.
 * Called from admin via {@link CataloguePackInfo} hooks (not pack-id branches).
 */
import {
  compareNarutoCatalogueRows,
  narutoFaceBandKey,
  narutoPrintKeySetCode,
  type CatalogueCardRow,
} from "@/lib/admin/catalogueCards";
import { resolvePrintScopedCatalogueFace } from "@/providers/shared/cardCatalogue/resolvePrintScopedFace";

import {
  canonicalizeNarutoPrintKey,
  isNarutoJapaneseVolumeSet,
  narutoCollectorKey,
  narutoCollectorNumberKey,
  parseNarutoCollector,
  NARUTO_PACK_ID,
} from "./identity";

/**
 * Admin / browse face URL when bytes resolve on disk.
 * Prefer concrete `/cards/…/art.*` (same Affiche SSOT); print roles remain
 * HTTP resolve fallbacks for foil / missing basename.
 */
export function resolveCarddassPrintScopedFace(opts: {
  printKey: string;
  lang: string;
}): Pick<CatalogueCardRow, "artUrl" | "thumbUrl" | "artFallbackFrom"> | null {
  return resolvePrintScopedCatalogueFace({
    packId: NARUTO_PACK_ID,
    printKey: opts.printKey,
    lang: opts.lang,
  });
}

function narutoBrowseIdentityKey(row: CatalogueCardRow): string {
  const lang = row.lang.toLowerCase();
  const membership = narutoPrintKeySetCode(row.printKey);
  if (membership === "promo" || membership === "prerelease") {
    return `${canonicalizeNarutoPrintKey(row.printKey)}\0${lang}`;
  }
  const collector =
    narutoCollectorKey(row.card) ?? canonicalizeNarutoPrintKey(row.printKey);
  if (
    lang === "ja" &&
    membership &&
    (isNarutoJapaneseVolumeSet(membership) || /^s[1-5]$/i.test(membership))
  ) {
    return `${collector}\0ja\0maki`;
  }
  if (
    membership &&
    /^s\d+$/i.test(membership) &&
    (lang === "fr" || lang === "it" || lang === "en")
  ) {
    return `${collector}\0${lang}\0${membership.toLowerCase()}`;
  }
  const band = narutoFaceBandKey(membership);
  return `${collector}\0${lang}\0${band}`;
}

function membershipLocaleScore(
  setCode: string | null,
  lang: string,
): number {
  if (!setCode) return 0;
  const ja = lang.toLowerCase() === "ja";
  if (isNarutoJapaneseVolumeSet(setCode)) return ja ? 100 : -40;
  if (/^s\d+$/i.test(setCode)) {
    if (ja) return 0;
    return 100 + Math.max(0, 20 - Number(setCode.slice(1)));
  }
  return 5;
}

function catalogueRowScore(row: CatalogueCardRow): number {
  let score = 0;
  if (row.printed === false) score -= 100;
  else score += 20;
  if (row.artUrl && !row.missingArt && !row.artFallbackFrom) score += 10;
  if (!row.artFallbackFrom) score += 3;
  if (row.name?.trim()) score += 50;
  score += membershipLocaleScore(
    narutoPrintKeySetCode(row.printKey),
    row.lang,
  );
  return score;
}

function appearanceSetOfRow(row: CatalogueCardRow): string | null {
  return narutoPrintKeySetCode(row.printKey);
}

function dropUnprintedWhenPrintedSiblingExists(
  rows: CatalogueCardRow[],
): CatalogueCardRow[] {
  const printedCollectors = new Set<string>();
  for (const row of rows) {
    if (row.kind && row.kind !== "face") continue;
    if (row.printed === false) continue;
    const collector = narutoCollectorKey(row.card);
    if (!collector) continue;
    const band = narutoFaceBandKey(narutoPrintKeySetCode(row.printKey));
    printedCollectors.add(`${collector}\0${row.lang.toLowerCase()}\0${band}`);
  }
  if (printedCollectors.size === 0) return rows;
  return rows.filter((row) => {
    if (row.kind && row.kind !== "face") return true;
    if (row.printed !== false) return true;
    const collector = narutoCollectorKey(row.card);
    if (!collector) return true;
    const band = narutoFaceBandKey(narutoPrintKeySetCode(row.printKey));
    return !printedCollectors.has(
      `${collector}\0${row.lang.toLowerCase()}\0${band}`,
    );
  });
}

function collapseNarutoAbBareJaRows(
  rows: CatalogueCardRow[],
): CatalogueCardRow[] {
  const groupingsByNumber = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.kind && row.kind !== "face") continue;
    const numberKey = narutoCollectorNumberKey(row.card);
    if (!numberKey) continue;
    const grouping =
      parseNarutoCollector(row.card)?.grouping?.toLowerCase() ?? "";
    const set = groupingsByNumber.get(numberKey) ?? new Set<string>();
    set.add(grouping);
    groupingsByNumber.set(numberKey, set);
  }
  const hideBareJa = new Set<string>();
  for (const [numberKey, groupings] of groupingsByNumber) {
    if (groupings.has("a") && groupings.has("b")) {
      hideBareJa.add(numberKey);
    }
  }
  if (hideBareJa.size === 0) return rows;
  return rows.filter((row) => {
    if (row.kind && row.kind !== "face") return true;
    if (row.lang.toLowerCase() !== "ja") return true;
    const grouping =
      parseNarutoCollector(row.card)?.grouping?.toLowerCase() ?? "";
    if (grouping) return true;
    const numberKey = narutoCollectorNumberKey(row.card);
    return numberKey == null || !hideBareJa.has(numberKey);
  });
}

/**
 * One browse tile per collector impression + face language.
 * EU FR/IT/EN keep each set-scoped membership; JA collapses onto 巻ノ.
 */
export function collapseNarutoCatalogueIdentityRows(
  rows: CatalogueCardRow[],
): CatalogueCardRow[] {
  const groups = new Map<string, CatalogueCardRow[]>();
  const passthrough: CatalogueCardRow[] = [];
  for (const row of rows) {
    if (row.kind && row.kind !== "face") {
      passthrough.push(row);
      continue;
    }
    const key = narutoBrowseIdentityKey(row);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  const collapsed: CatalogueCardRow[] = [];
  for (const list of groups.values()) {
    if (list.length === 1) {
      const only = list[0]!;
      const set = appearanceSetOfRow(only);
      collapsed.push(
        set && !only.appearanceSets
          ? { ...only, appearanceSets: [set] }
          : only,
      );
      continue;
    }
    list.sort((a, b) => {
      const byScore = catalogueRowScore(b) - catalogueRowScore(a);
      if (byScore !== 0) return byScore;
      return a.printKey.localeCompare(b.printKey);
    });
    const winner = list[0]!;
    const appearanceSets = [
      ...new Set(
        list
          .map((row) => appearanceSetOfRow(row))
          .filter((set): set is string => Boolean(set)),
      ),
    ].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
    collapsed.push(
      appearanceSets.length ? { ...winner, appearanceSets } : winner,
    );
  }
  return collapseNarutoAbBareJaRows(
    dropUnprintedWhenPrintedSiblingExists(
      [...passthrough, ...collapsed].sort(compareNarutoCatalogueRows),
    ),
  );
}
