/**
 * « Inclus dans » pour un tirage d’étagère : résout le set, charge les
 * produits scellés des packs de l’étagère, renvoie les sources triées.
 */
import { PROVIDER_MODULES } from "@/core/catalog/registry";
import { parsePrintKey } from "@/core/identify/printKey";
import {
  sealedContainmentForPrint,
  type SealedContainmentSource,
} from "@/core/collect/sealedContainment";
import {
  gamesInShelf,
  resolveChecklistCatalogueIds,
} from "@/lib/collect/shelfChecklist";
import { loadContainmentProducts } from "@/lib/collect/sealedProductsLoad";
import type { ProviderModule } from "@/types/providerModule";
import type { MediaType } from "@/types/providerRegistry";

function providersForShelf(input: {
  type: MediaType;
  games: ReadonlySet<string>;
  catalogueIds?: ReadonlySet<string>;
}): ProviderModule[] {
  const candidates = PROVIDER_MODULES.filter(
    (pack) =>
      pack.info.types.includes(input.type) &&
      typeof pack.listSetPrints === "function" &&
      typeof pack.listPrintSets === "function",
  );
  const byGame =
    input.games.size === 0
      ? candidates
      : candidates.filter((pack) =>
          (pack.printGames ?? []).some((game: string) =>
            input.games.has(game),
          ),
        );
  const scoped = byGame.length > 0 ? byGame : candidates;
  if (!input.catalogueIds || input.catalogueIds.size === 0) return scoped;
  const byCatalogue = scoped.filter((pack) =>
    input.catalogueIds!.has(pack.info.id),
  );
  return byCatalogue.length > 0 ? byCatalogue : scoped;
}

async function resolvePrintSetId(input: {
  modules: readonly ProviderModule[];
  printKey: string;
  language?: string | null;
}): Promise<string | null> {
  const language = input.language?.trim().toLowerCase() || null;
  for (const pack of input.modules) {
    if (!pack.lookupPrint) continue;
    try {
      const hit = await pack.lookupPrint({
        printKey: input.printKey,
        language,
      });
      const code = hit?.setCode?.trim();
      if (code) return code;
    } catch {
      /* pack muet */
    }
  }
  const parsed = parsePrintKey(input.printKey);
  return parsed?.set?.trim() || null;
}

export async function sealedContainmentForShelfPrint(input: {
  shelfType: MediaType;
  shelfName?: string | null;
  printKey: string;
  language?: string | null;
}): Promise<SealedContainmentSource[]> {
  const printKey = input.printKey.trim();
  if (!printKey) return [];

  const owned = new Set([printKey.toLowerCase()]);
  const games = gamesInShelf(owned);
  const gameScoped = providersForShelf({ type: input.shelfType, games });
  const catalogueIds = await resolveChecklistCatalogueIds({
    modules: gameScoped,
    shelfName: input.shelfName,
    owned,
    language: input.language,
  });
  const modules = providersForShelf({
    type: input.shelfType,
    games,
    catalogueIds,
  });

  const sealedModules =
    catalogueIds.size > 0
      ? PROVIDER_MODULES.filter(
          (pack) =>
            pack.info.types.includes(input.shelfType) &&
            catalogueIds.has(pack.info.id),
        )
      : PROVIDER_MODULES.filter((pack) => {
          if (!pack.info.types.includes(input.shelfType)) return false;
          if (
            games.size > 0 &&
            !(pack.printGames ?? []).some((game) => games.has(game))
          ) {
            return false;
          }
          return true;
        });

  const products = sealedModules.flatMap((pack) =>
    loadContainmentProducts(pack.catalog?.dataPack),
  );

  const setId = await resolvePrintSetId({
    modules,
    printKey,
    language: input.language,
  });

  return sealedContainmentForPrint({
    printKey,
    setId,
    products,
    preferredLanguage: input.language,
  });
}
