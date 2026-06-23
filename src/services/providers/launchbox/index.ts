import { teardownMetadataWhen } from "@/lib/providerTeardownHelpers";
import { metadataProbe } from "@/lib/mappingProbeUtils";

import type { ProviderModule } from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";

import { fetchFromLaunchBox } from "./resolver";

export const launchboxModule: ProviderModule = {
  info: {
    id: "launchbox",
    label: "LaunchBox",
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
    auth: { kind: "scrape" },
    canonical: true,
    notes:
      "Base communautaire LaunchBox (Metadata.zip). Index local: jeux, nombre de joueurs max, titres alternatifs regionaux, images (box, fanart, screenshots).",
  },
  evidence: {
    label: "LaunchBox",
    sourceWeight: 0.42,
    canonical: true,
    cleanCachedNames: true,
  },
  createMetadataAdapter: () => ({
    id: "launchbox",
    async resolve({ name, platform }) {
      return (await fetchFromLaunchBox(
        name,
        platform,
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
};

export { fetchFromLaunchBox } from "./resolver";
