import { createKeyHealthCheck } from "@/lib/providerHealthUtils";
import { metadataProbe } from "@/lib/mappingProbeUtils";

import type { ProviderModule } from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";
import { teardownMetadataWhen } from "@/lib/providerTeardownHelpers";

import { pingTheGamesDb } from "./fetch";
import { fetchFromTheGamesDB } from "./resolver";

export { fetchFromTheGamesDB } from "./resolver";

export const thegamesdbModule: ProviderModule = {
  info: {
    id: "thegamesdb",
    label: "TheGamesDB",
    types: ["games"],
    requiresTitleAlignment: true,
    capabilities: [
      "identify",
      "cover",
      "description",
      "releaseDate",
      "people",
      "players",
    ],
    auth: {
      kind: "key",
      env: ["THEGAMESDB_API_KEY"],
      free: true,
    },
    canonical: true,
    notes:
      "The GameDB / TheGamesDB — titres PAL/EU et jaquettes régionales. Fallback quand ScreenScraper est indisponible.",
  },
  evidence: {
    label: "TheGamesDB",
    sourceWeight: 0.44,
    canonical: true,
    cleanCachedNames: true,
  },
  createMetadataAdapter: () => ({
    id: "thegamesdb",
    async resolve({ name, barcode, platform }: any) {
      return (await fetchFromTheGamesDB(
        name,
        platform,
        barcode,
      )) as MetadataResult | null;
    },
  }),
  healthCheck: createKeyHealthCheck(
    "thegamesdb",
    "TheGamesDB",
    ["THEGAMESDB_API_KEY"],
    (key) =>
      `https://api.thegamesdb.net/v1/Platforms?apikey=${encodeURIComponent(key)}`,
  ),
  testHandlers: {
    "thegamesdb-metadata": {
      label: "TheGamesDB - Metadata",
      kind: "metadata",
      run: (query) => fetchFromTheGamesDB(query),
    },
  },
  buildTeardownMetadataTasks(ctx) {
    return teardownMetadataWhen(
      ctx,
      "TheGamesDB",
      () => fetchFromTheGamesDB(ctx.name, ctx.platform, ctx.barcode),
      "games",
    );
  },
  mappingProbe: {
    sampleInput: "GoldenEye: Au Service Du Mal",
    context: {
      name: "GoldenEye: Au Service Du Mal",
      platform: "PlayStation 2",
    },
  },
  runMappingProbe: async () => {
    const result = await pingTheGamesDb();
    if (!result.ok) return null;
    const metadata = await fetchFromTheGamesDB(
      "GoldenEye: Au Service Du Mal",
      "PlayStation 2",
    );
    return metadataProbe(metadata);
  },
};
