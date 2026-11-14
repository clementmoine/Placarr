/**
 * Server-only catalogue pack hooks (fold / collapse / print-scoped faces /
 * preferred-lang axis).
 *
 * {@link cataloguePackInfo} is imported by client scan UI — never hang Node
 * callbacks (sharp, pg, fs) on that object. Resolve hooks here instead.
 */
import "server-only";

import type { CardsIndexV1 } from "@/effects/cardsIndex";
import type { CataloguePackId } from "@/lib/admin/cataloguePacks";
import {
  collapseNarutoCatalogueIdentityRows,
  resolveCarddassPrintScopedFace,
} from "@/providers/naruto/narutocarddass/catalogueMaterialize";
import { NARUTO_PACK_ID } from "@/providers/naruto/narutocarddass/packs";
import { foldNarutoCardsIndex } from "@/providers/naruto/narutocarddass/pipeline";
import { matchesNarutoPreferredLocaleAxis } from "@/providers/naruto/narutocarddass/preferredLocaleAxis";

export type CataloguePackHooks = {
  foldCardsIndex?: (index: CardsIndexV1) => CardsIndexV1;
  resolvePrintScopedFace?: (opts: {
    printKey: string;
    lang: string;
  }) => {
    artUrl: string;
    thumbUrl?: string;
    artFallbackFrom?: string;
  } | null;
  collapseCatalogueIdentityRows?: <T extends { printKey: string }>(
    rows: T[],
  ) => T[];
  matchesPreferredLocaleAxis?: (
    row: {
      kind?: string;
      printKey: string;
      set: string;
      card: string;
      appearanceSets?: readonly string[];
    },
    preferLang: string,
  ) => boolean;
};

const CARDDASS_HOOKS: CataloguePackHooks = {
  foldCardsIndex: foldNarutoCardsIndex,
  resolvePrintScopedFace: resolveCarddassPrintScopedFace,
  collapseCatalogueIdentityRows: collapseNarutoCatalogueIdentityRows,
  matchesPreferredLocaleAxis: matchesNarutoPreferredLocaleAxis,
};

export function cataloguePackHooks(
  pack: CataloguePackId,
): CataloguePackHooks {
  if (pack === NARUTO_PACK_ID) return CARDDASS_HOOKS;
  return {};
}
