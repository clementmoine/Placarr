import {
  createMetadataHealthCheck,
  pingUrl,
} from "@/lib/providerHealthUtils";
import { fetchFromHowLongToBeat } from "./fetch";

import type { ProviderModule } from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";
import { teardownMetadataWhen } from "@/lib/providerTeardownHelpers";

export { fetchFromHowLongToBeat } from "./fetch";

export const howlongtobeatModule: ProviderModule = {
  info: {
    id: "howlongtobeat",
    label: "HowLongToBeat",
    types: ["games"],
    capabilities: ["cover", "duration"],
    auth: { kind: "scrape" },
    canonical: true,
    notes: "Durées de jeu (time-to-beat) + jaquette quand disponible.",
  },
  createMetadataAdapter: () => ({
    id: "howlongtobeat",
    async resolve({ name, platform }) {
      return (await fetchFromHowLongToBeat(
        name,
        platform,
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
};
