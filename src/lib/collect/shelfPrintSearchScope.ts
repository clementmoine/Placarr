/**
 * Scope print search to the catalogue the shelf already implies.
 *
 * Same signals as the print picker / checklist: unique shelf name → catalogue,
 * else unique catalogue among owned printKeys' sets. Ambiguous → no scope
 * (honest empty later beats a confident wrong game).
 */
import { PROVIDER_MODULES } from "@/core/catalog/registry";
import {
  printSearchCatalogues,
  type PrintSearchOptions,
} from "@/core/identify/printSearch";

import {
  inferPrintPickerDefaults,
  type PrintPickerOwnedHint,
} from "@/lib/collect/inferPrintPickerDefaults";
import { resolveChecklistCatalogueIds } from "@/lib/collect/shelfChecklist";

function searchModulesFor(type: string) {
  return PROVIDER_MODULES.filter(
    (module) =>
      typeof module.searchPrints === "function" &&
      module.info.types.some((mediaType) => mediaType === type),
  );
}

/**
 * Options to pass to `searchPrintCandidates` / `resolveUniquePrintCandidate`
 * when resolving pastes against a known shelf.
 */
export async function shelfPrintSearchScope(input: {
  type: string;
  shelfName?: string | null;
  owned?: readonly PrintPickerOwnedHint[];
}): Promise<PrintSearchOptions> {
  const owned = input.owned ?? [];
  const catalogues = await printSearchCatalogues(input.type);
  const inferred = inferPrintPickerDefaults(
    input.shelfName,
    catalogues,
    owned,
  );

  const ownedKeys = new Set(
    owned
      .map((row) => row.printKey?.trim())
      .filter((key): key is string => Boolean(key)),
  );

  const catalogueIds = await resolveChecklistCatalogueIds({
    modules: searchModulesFor(input.type),
    shelfName: input.shelfName,
    owned: ownedKeys,
    language: inferred.language,
  });

  if (catalogueIds.size !== 1) return {};

  const providerId = [...catalogueIds][0]!;
  return {
    providerId,
    ...(inferred.setId ? { setId: inferred.setId } : {}),
    ...(inferred.language ? { language: inferred.language } : {}),
  };
}
