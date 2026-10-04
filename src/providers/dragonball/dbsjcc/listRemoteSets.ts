/**
 * Checklist / print-picker sets for Dragon Ball JCC — labels only.
 * Pas d'icône packshot/face : ce n'est pas un symbole d'extension (contrairement
 * aux logos set Pokémon / TCGdex).
 */
import type { SetOption } from "@/providers/shared/cardCatalogue/sets";
import { finalizeSetOptions } from "@/providers/shared/cardCatalogue/sets";
import { loadProductsIndexFromSqlite } from "@/providers/shared/sealedProducts/productsSqlite";

import { DBS_JCC_PACK_ID } from "./pack";
import {
  dbsjccSetDisplayCode,
  dbsjccSetLabel,
  dbsjccSetPrefixCode,
  dbsjccSetSortKey,
} from "./printKey";

/** Sets announced for the print picker / checklist. */
export function listDbsjccRemoteSets(
  _language?: string | null,
): SetOption[] {
  const index = loadProductsIndexFromSqlite(DBS_JCC_PACK_ID);
  const setCodes = new Set<string>();
  if (index) {
    for (const entry of Object.values(index.products)) {
      const code = (entry.setCode ?? "").trim().toLowerCase();
      if (code) setCodes.add(code);
    }
  }
  // Promo / SP / accessoire (Détecteur) : pas de SKU scellé — set picker quand même.
  for (const code of ["promo", "sp", "accessory"] as const) {
    setCodes.add(code);
  }

  return finalizeSetOptions(
    [...setCodes].map((id) => ({
      id,
      code: dbsjccSetDisplayCode(id),
      label: dbsjccSetLabel(id),
      prefixCode: dbsjccSetPrefixCode(id),
      sortKey: dbsjccSetSortKey(id),
    })),
  );
}
