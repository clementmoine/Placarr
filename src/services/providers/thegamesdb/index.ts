import { createKeyHealthCheck } from "@/lib/provider/healthUtils";
import { metadataProbe, probeErrorResult } from "@/lib/dev/mappingProbe";

import type { ProviderModule } from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";
import { teardownMetadataWhen } from "@/lib/provider/teardownHelpers";

import { pingTheGamesDb } from "./fetch";
import { fetchFromTheGamesDB } from "./resolver";
import { isTheGamesDbQuotaBlocked } from "./quota";

export { fetchFromTheGamesDB } from "./resolver";

export const thegamesdbModule: ProviderModule = {
  info: {
    id: "thegamesdb",
    label: "TheGamesDB",
    factLabel: "TGDB",
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
    websiteUrl: "https://thegamesdb.net/",
    apiKeyDashboardUrl: "https://api.thegamesdb.net/key.php",
    mappingProbeConfigHint:
      "THEGAMESDB_API_KEY missing — request one at api.thegamesdb.net/key.php",
    notes:
      "The GameDB / TheGamesDB — titres PAL/EU et jaquettes régionales. Fallback quand ScreenScraper est indisponible.",
  },
  evidence: {
    label: "TheGamesDB",
    sourceWeight: 0.44,
    canonical: true,
    cleanCachedNames: true,
  },
  isMetadataQuotaBlocked: isTheGamesDbQuotaBlocked,
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
    if (!result.ok) {
      const statusHint = result.error?.includes("missing") ? "blocked" : "error";
      return probeErrorResult(result.error ?? "TheGamesDB unreachable", statusHint);
    }
    const metadata = await fetchFromTheGamesDB(
      "GoldenEye: Au Service Du Mal",
      "PlayStation 2",
    );
    return metadataProbe(metadata);
  },
};
