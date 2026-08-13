/**
 * Pokémon TCG Live — official local ingest (CDN / APK → data/pokemon).
 * Identity join: `catalog.sqlite`. Catalogue tiers remains `tcgdex`.
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { createMetadataHealthCheck } from "@/core/catalog/healthUtils";
import { parsePrintKey } from "@/core/identify/printKey";
import { dataRoot } from "@/lib/runtimeData";
import type { MetadataResult } from "@/types/metadataProvider";
import type {
  MetadataAdapterContext,
  ProviderModule,
} from "@/types/providerModule";

import {
  buildPokemonLiveAttachments,
  liveTitleForPrint,
} from "./liveAssets";
import { pokemontcgliveCatalog } from "./pipeline";

const PROVIDER_ID = "pokemontcglive";
const PROVIDER_LABEL = "Pokémon TCG Live (local)";
const POKEMON_GAME = "pokemon";

export function pokemonLiveCardsDbPath(): string {
  const override = process.env.PLACARR_LIVE_CARDS_DB?.trim();
  if (override) return path.resolve(override);
  return path.join(dataRoot(), "pokemon", "catalog.sqlite");
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
    imageUrl: attachments[0]?.url,
    attachments,
    externalIds: {
      [PROVIDER_ID]: printKey,
      printKey,
    },
  };
}

export const pokemontcgliveModule: ProviderModule = {
  info: {
    id: PROVIDER_ID,
    label: PROVIDER_LABEL,
    types: ["tcg"],
    capabilities: ["identify", "cover"],
    auth: { kind: "none" },
    supplyMode: "local_catalog",
    canonical: false,
    defaultLanguage: "en",
    websiteUrl: "https://www.pokemon.com/us/pokemon-tcg/",
    notes:
      "Ingest officiel TCG Live (CDN + APK) → `data/pokemon/` + `catalog.sqlite`. Langues Live : fr,en,de,it,es,ptbr (Dex : ptbr→pt-br). Art Live (`tcglive-front`) ; `tcgdex` reste le catalogue API. Sync : `pnpm foil:pokemon`.",
  },
  catalog: pokemontcgliveCatalog,
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
          : `Index unavailable — run pnpm foil:pokemon:index-cards (${dbPath})`,
        configured: true,
      };
    },
  ),
};

export { buildPokemonLiveAttachments, liveFrontUrlForPrint } from "./liveAssets";
export {
  collectIdentitiesFromConfigCache,
  liveFoilMaskOverrideMap,
  writeLiveCardsSqlite,
  writeLiveFoilMasksJson,
} from "./cardDatabase";
export { indexLiveCards } from "./indexCards";
export { scrape, loadNames, catalogueSetnumsFromConfig } from "./cdn";
export { resolveCdnTarget, writeSourcesReport } from "./sources";
export {
  fetchContentBase,
  contentBaseFromGameSettings,
  gameSettingsUrl,
  syntheticContentBase,
} from "./gameSettings";
export {
  assetManifestUrl,
  filterCardBundleNames,
  intersectWantedWithManifest,
  loadCdnManifestDump,
} from "./cdnManifest";
export {
  POKEMON_LIVE_LANGUAGES,
  POKEMON_LIVE_DEFAULT_LANGUAGE,
  POKEMON_LIVE_SCRAPE_DEFAULT_LANGUAGES,
  POKEMON_LIVE_LANGS_CSV,
  POKEMON_LIVE_SCRAPE_DEFAULT_LANGS_CSV,
  LIVE_LANG_TO_TCGDEX,
  isPokemonLiveLanguage,
  tcgdexLangFromLive,
} from "./languages";
export {
  bootstrapMalieCatalogue,
  bundleStemFromCardId,
  bundleStemFromMalieImagePath,
  loadMalieBundleStems,
  filterMalieStemsByLangs,
  MALIE_DATABASES_INDEX_URL,
} from "./malie";
export {
  buildScrapeInventory,
  mergeCdnResultsIntoInventory,
  mergeLiveIdentities,
  malieCardTexUrl,
  loadScrapeInventoryStems,
} from "./scrapeInventory";
