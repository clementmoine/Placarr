import { createMetadataHealthCheck, pingUrl } from "@/core/catalog/healthUtils";
import { fetchFromHowLongToBeat } from "./fetch";
import {
  mappingRawKeysFromFetch,
  probeContextOrDefault,
} from "@/lib/dev/mappingRawKeys";

import type { ProviderModule } from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";
import { teardownMetadataWhen } from "@/core/catalog/teardownHelpers";

export { fetchFromHowLongToBeat } from "./fetch";

export const howlongtobeatModule: ProviderModule = {
  info: {
    id: "howlongtobeat",
    label: "HowLongToBeat",
    minRequestIntervalMs: 500,
    types: ["games"],
    capabilities: ["identify", "duration"],
    auth: { kind: "scrape" },
    canonical: true,
    imageScoreAdjustment: -500,
    websiteUrl: "https://howlongtobeat.com/",
    timeToBeatSource: true,
    timeToBeatFactSourcePrefix: "How Long to Beat",
    notes: "Durées de jeu (time-to-beat) + jaquette quand disponible.",
  },
  createMetadataAdapter: () => ({
    id: "howlongtobeat",
    async resolve({ name, platform, signal }) {
      return (await fetchFromHowLongToBeat(
        name,
        platform,
        signal,
      )) as MetadataResult | null;
    },
  }),
  healthCheck: createMetadataHealthCheck(
    "howlongtobeat",
    "How Long to Beat",
    async () => {
      const start = Date.now();
      const isUp = await pingUrl("https://howlongtobeat.com");
      return {
        ok: isUp,
        latency: Date.now() - start,
        error: isUp ? null : "Host unreachable",
      };
    },
  ),
  testHandlers: {
    "hltb-metadata": {
      label: "How Long to Beat - Metadata",
      kind: "metadata",
      run: (query) => fetchFromHowLongToBeat(query),
    },
  },
  buildTeardownMetadataTasks(ctx) {
    return teardownMetadataWhen(
      ctx,
      "HowLongToBeat",
      () => fetchFromHowLongToBeat(ctx.name, ctx.platform),
      "games",
    );
  },
  mappingProbe: {
    sampleInput: "The Legend of Zelda: Skyward Sword (Wii)",
    context: {
      name: "The Legend of Zelda: Skyward Sword",
      platform: "wii",
    },
  },
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: "The Legend of Zelda: Skyward Sword",
      platform: "wii",
    });
    return mappingRawKeysFromFetch(() =>
      fetchFromHowLongToBeat(ctx.name, ctx.platform ?? undefined),
    );
  },
};
