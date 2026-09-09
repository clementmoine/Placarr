/**
 * Ligne TCG locale vide-mais-branchée — factory pour les catalogues qui
 * ouvrent un onglet avant la première moisson (phase 7 : OPTCG, Digimon,
 * Yu-Gi-Oh, MTG).
 */
import { cardCatalogueHooks } from "@/providers/shared/cardCatalogue/pipeline";
import {
  createLocalTcgLine,
  type LocalTcgLine,
  type LocalTcgLineSpec,
} from "@/providers/shared/cardCatalogue/localTcgLine";
import type {
  ProviderCatalogHooks,
  ProviderModule,
} from "@/types/providerModule";

export type EmptyLocalTcgProvider = {
  line: LocalTcgLine;
  catalog: ProviderCatalogHooks;
  module: ProviderModule;
};

export function createEmptyLocalTcgProvider(input: {
  lineSpec: LocalTcgLineSpec;
  runPipeline: (
    argv: readonly string[],
  ) => Promise<{ cards: number; products: number }>;
  /** Same meaning as `cardCatalogueHooks` — e.g. skip sealed on auto refresh. */
  autoSkip?: readonly string[];
}): EmptyLocalTcgProvider {
  const line = createLocalTcgLine(input.lineSpec);
  const catalog = cardCatalogueHooks({
    packId: input.lineSpec.packId,
    dbPath: line.index.dbPath,
    runPipeline: input.runPipeline,
    autoSkip: input.autoSkip,
  });
  return {
    line,
    catalog,
    module: line.attachCatalog(catalog),
  };
}
