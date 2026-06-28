import { rawProbe } from "@/lib/dev/mappingProbe";
import { teardownMetadataWhen } from "@/lib/provider/teardownHelpers";

import type { ProviderModule } from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";

import { fetchCoverFromCoverProject, fetchFromCoverProject } from "./resolver";

export const coverprojectModule: ProviderModule = {
  info: {
    id: "coverproject",
    label: "Cover Project",
    types: ["games"],
    capabilities: ["cover"],
    auth: { kind: "scrape" },
    canonical: true,
    // Covers are full front+back wraps, so the display scorer penalises them and
    // ranks them below standard 2D/3D fronts.
    fullWrapCover: true,
    websiteUrl: "https://www.thecoverproject.net/",
    notes: "Jaquettes custom haute qualité (souvent PAL/EU).",
  },
  evidence: {
    label: "Cover Project",
    sourceWeight: 0.41,
    canonical: true,
  },
  createMetadataAdapter: () => ({
    id: "coverproject",
    async resolve({ name, platform }) {
      return (await fetchFromCoverProject(
        name,
        platform,
      )) as MetadataResult | null;
    },
  }),
  testHandlers: {
    "coverproject-metadata": {
      label: "The Cover Project - Covers",
      kind: "cover",
      run: (query, type) =>
        fetchCoverFromCoverProject(
          query,
          type === "games" ? "Nintendo Switch" : "",
        ),
    },
  },
  buildTeardownMetadataTasks(ctx) {
    return teardownMetadataWhen(
      ctx,
      "TheCoverProject",
      async () => {
        const coverUrl = await fetchCoverFromCoverProject(
          ctx.name,
          ctx.platform || "",
        );
        if (!coverUrl) return null;
        return {
          title: ctx.name,
          imageUrl: coverUrl,
          attachments: [
            { type: "cover", url: coverUrl, source: "coverproject" },
          ],
        };
      },
      "games",
    );
  },
  mappingProbe: {
    sampleInput: "The Legend of Zelda: Skyward Sword (Wii)",
    context: {
      name: "The Legend of Zelda: Skyward Sword",
      platform: "Nintendo Wii",
    },
  },
  runMappingProbe: async () => {
    const title = "The Legend of Zelda: Skyward Sword";
    const url = await fetchCoverFromCoverProject(title, "Nintendo Wii");
    if (!url) return null;
    return rawProbe({ url, title });
  },
};

export { fetchCoverFromCoverProject, fetchFromCoverProject } from "./resolver";
export {
  buildCoverProjectCdnCandidates,
  fetchCoverFromCoverProjectCdn,
  slugCoverProjectTitle,
} from "./cdnLookup";
