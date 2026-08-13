import { teardownMetadataWhen } from "@/core/catalog/teardownHelpers";
import { metadataProbe } from "@/lib/dev/mappingProbe";
import { collectObjectMappingSignals } from "@/lib/dev/scrapeMappingSignals";
import { probeContextOrDefault } from "@/lib/dev/mappingRawKeys";

import type { ProviderModule } from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";

import {
  fetchFromLaunchBox,
  fetchFromLaunchBoxWithLookupQueries,
} from "./resolver";
import { launchboxCatalog } from "./pipeline";

export const launchboxModule: ProviderModule = {
  info: {
    id: "launchbox",
    label: "LaunchBox",
    // Local SQLite FTS: parallel reads help, but not unbounded.
    maxConcurrentRequests: 2,
    types: ["games"],
    requiresTitleAlignment: true,
    capabilities: [
      "identify",
      "description",
      "releaseDate",
      "people",
      "players",
      "cover",
      "screenshots",
    ],
    auth: { kind: "none" },
    supplyMode: "local_catalog",
    canonical: true,
    defaultLanguage: "en",
    isRealBoxCover: true,
    websiteUrl: "https://gamesdb.launchbox-app.com/",
    notes:
      "Base communautaire LaunchBox (Metadata.zip). Index SQLite local prébuild (`pnpm launchbox:update`) — pas de download au scan. Jeux, joueurs max, titres régionaux, images. Enrichissement par titre — pas de barcode GTIN. Tourne en pass API pour ne pas être sauté quand ScreenScraper/IGDB ont déjà titre+cover.",
  },
  catalog: launchboxCatalog,
  createMetadataAdapter: () => ({
    id: "launchbox",
    async resolve({ name, platform, lookupQueries }) {
      return (await fetchFromLaunchBoxWithLookupQueries(
        name,
        platform,
        lookupQueries,
      )) as MetadataResult | null;
    },
  }),
  testHandlers: {
    "launchbox-metadata": {
      label: "LaunchBox - Metadata",
      kind: "metadata",
      run: (query) => fetchFromLaunchBox(query),
    },
  },
  buildTeardownMetadataTasks(ctx) {
    return teardownMetadataWhen(
      ctx,
      "LaunchBox",
      () => fetchFromLaunchBox(ctx.name, ctx.platform),
      "games",
    );
  },
  mappingProbe: {
    sampleInput: "GoldenEye: Rogue Agent (PlayStation 2)",
    context: {
      name: "GoldenEye: Rogue Agent",
      platform: "PlayStation 2",
    },
  },
  runMappingProbe: async () => {
    const metadata = await fetchFromLaunchBox(
      "GoldenEye: Rogue Agent",
      "PlayStation 2",
    );
    return metadataProbe(metadata);
  },
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: "GoldenEye: Rogue Agent",
      platform: "PlayStation 2",
    });
    const metadata = await fetchFromLaunchBox(
      ctx.name,
      ctx.platform ?? undefined,
    );
    return collectObjectMappingSignals(metadata);
  },
};

export { fetchFromLaunchBox } from "./resolver";
