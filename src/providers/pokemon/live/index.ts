/**
 * Pokémon TCG Live — official local ingest (CDN / APK → data/pokemon).
 * Live join store: `live.sqlite`. Catalogue identity remains TCGdex (`catalog.sqlite`).
 * This module owns picker / check-list; `tcgdex` stays harvest + enrich + prix.
 */
import { existsSync } from "node:fs";

import { createMetadataHealthCheck } from "@/core/catalog/healthUtils";
import { parsePrintKey } from "@/core/identify/printKey";
import type { MetadataResult } from "@/types/metadataProvider";
import type {
  MetadataAdapterContext,
} from "@/types/providerModule";
import { defineProvider } from "@/providers/shared/defineProvider";
import type { BoosterCompositionFile } from "@/providers/shared/sealedProducts/boosterComposition";
import {
  ensurePokemonDbLayout,
  pokemonLiveDbPath,
} from "@/providers/pokemon/paths";
import tcgdexBoosterComposition from "@/providers/pokemon/tcgdex/curated/booster-composition.json";
import {
  ensureTcgdexSetLogoIndex,
  loadTcgdexSetLogoIndex,
  tcgdexCatalogueSetIdForProduct,
  tcgdexLogoUrlForProduct,
} from "@/providers/pokemon/tcgdex/setLogos";

import {
  buildPokemonLiveAttachments,
  liveDefaultImageUrl,
  liveTitleForPrint,
} from "./disk/liveAssets";
import { pokemontcgliveCatalog } from "./pipeline";
import {
  labelPokemonLivePrintSet,
  listPokemonLivePrintLanguages,
  listPokemonLivePrintSetsMerged,
  listPokemonLiveSetPrints,
  lookupPokemonLivePrintWithRemote,
  searchPokemonLivePrints,
  searchPokemonLivePrintsWithRemote,
} from "./printSearch";

const PROVIDER_ID = "pokemontcglive";
const PROVIDER_LABEL = "Pokémon TCG Live (local)";
const POKEMON_GAME = "pokemon";

export function pokemonLiveCardsDbPath(): string {
  ensurePokemonDbLayout();
  return pokemonLiveDbPath();
}

function resolveFromLocal(ctx: MetadataAdapterContext): MetadataResult | null {
  const printKey =
    ctx.printKey?.trim() || ctx.externalIds?.printKey?.trim() || "";
  if (!printKey) return null;
  const parsed = parsePrintKey(printKey);
  if (parsed && parsed.game !== POKEMON_GAME) return null;

  const name = ctx.name?.trim() || null;
  const attachments = buildPokemonLiveAttachments({
    printKey,
    name,
    title: name,
  });
  if (attachments.length === 0) return null;

  const title = liveTitleForPrint({ printKey, name }) ?? name ?? printKey;
  return {
    title,
    imageUrl:
      liveDefaultImageUrl({ printKey, name, title }) ?? attachments[0]?.url,
    attachments,
    externalIds: {
      [PROVIDER_ID]: printKey,
      printKey,
    },
  };
}

export const pokemontcgliveModule = defineProvider({
  info: {
    id: PROVIDER_ID,
    label: PROVIDER_LABEL,
    catalogueLabel: "Pokémon",
    catalogueAliases: ["Pokemon", "Pokémon TCG", "Pokemon TCG"],
    types: ["tcg"],
    nameDatabase: true,
    capabilities: ["identify", "cover"],
    auth: { kind: "none" },
    supplyMode: "local_catalog",
    catalogLifecycle: "living",
    canonical: false,
    defaultLanguage: "fr",
    websiteUrl: "https://www.pokemon.com/us/pokemon-tcg/",
    notes:
      "Owner catalogue Pokémon (picker + check-list + scellés). Ingest Live (CDN + APK) → `data/pokemon/` ; identité = TCGdex `catalog.sqlite` (repli API distant tant que Sync n'a pas peuplé). `tcgdex` = harvest + enrich + prix. Foil : `live.sqlite`. Produits scellés : pkmcards.fr.",
  },
  catalog: pokemontcgliveCatalog,
  /*
    Logos de set = relevé TCGdex ; foil / CDN = ce module. Les deux se
    rejoignent ici plutôt que dans du code partagé qui connaîtrait les deux.
  */
  refreshSetLogos: async () => {
    const logos = await ensureTcgdexSetLogoIndex();
    if (!logos) return "tcgdex set logos : indisponible";
    const withLogo = logos.sets.filter((row) => row.logo).length;
    return `tcgdex set logos : ${withLogo} wordmarks / ${logos.sets.length} sets`;
  },
  printGames: [POKEMON_GAME],
  listPrintLanguages: () => listPokemonLivePrintLanguages(),
  labelPrintSet: ({ setCode, language }) =>
    labelPokemonLivePrintSet({ setCode, language }),
  listPrintSets: async (_type, language) =>
    listPokemonLivePrintSetsMerged(language),
  loadBoosterComposition: () => {
    const raw = tcgdexBoosterComposition as BoosterCompositionFile;
    return raw?.version === 1 ? raw : null;
  },
  suggestDatabaseTitles: async ({ cleanedName }) => {
    const local = searchPokemonLivePrints(cleanedName, { limit: 10 });
    if (local.length > 0) {
      return Array.from(new Set(local.map((row) => row.title)));
    }
    const remote = await searchPokemonLivePrintsWithRemote(cleanedName, {
      limit: 10,
    });
    return Array.from(new Set(remote.map((row) => row.title)));
  },
  searchPrints: async ({
    query,
    language,
    limit,
    signal,
    setId,
    catalogueBrowse,
  }) =>
    searchPokemonLivePrintsWithRemote(query, {
      language,
      limit,
      signal,
      setId,
      catalogueBrowse,
    }),
  lookupPrint: async ({ printKey, name, language, signal }) =>
    lookupPokemonLivePrintWithRemote(printKey, {
      language,
      name,
      signal,
    }),
  listSetPrints: async ({ setId, language, includeUnprinted }) =>
    listPokemonLiveSetPrints({ setId, language, includeUnprinted }),
  resolveSetLogo: ({ setCode, slug, name }) =>
    tcgdexLogoUrlForProduct({
      setCode,
      slug,
      name,
      index: loadTcgdexSetLogoIndex(),
    }),
  resolveCatalogueSetId: ({ setCode, slug, name }) =>
    tcgdexCatalogueSetIdForProduct({
      setCode,
      slug,
      name,
      index: loadTcgdexSetLogoIndex(),
    }),
  createMetadataAdapter: () => ({
    id: PROVIDER_ID,
    async resolve(ctx) {
      return resolveFromLocal(ctx);
    },
  }),
  // Local ingest resolves by printKey only — probe the same path.
  mappingProbe: {
    sampleInput: "pokemon:bw10-001",
    context: { printKey: "pokemon:bw10-001" },
  },
  healthCheck: createMetadataHealthCheck(
    PROVIDER_ID,
    PROVIDER_LABEL,
    async () => {
      const start = Date.now();
      const dbPath = pokemonLiveCardsDbPath();
      const ok = existsSync(dbPath);
      return {
        ok,
        latency: Date.now() - start,
        error: ok
          ? null
          : `Index unavailable — run Catalogue Sync for Pokémon (${dbPath})`,
        configured: true,
      };
    },
  ),
});

export {
  buildPokemonLiveAttachments,
  liveFrontUrlForPrint,
} from "./disk/liveAssets";
