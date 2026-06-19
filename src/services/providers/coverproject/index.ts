import { rawProbe } from "@/lib/mappingProbeUtils";
import { teardownMetadataWhen } from "@/lib/providerTeardownHelpers";

import type { ProviderModule } from "@/types/providerModule";

import { fetchCoverFromCoverProject } from "./resolver";

export const coverprojectModule: ProviderModule = {
  info: {
    id: "coverproject",
    label: "Cover Project",
    types: ["games"],
    capabilities: ["cover"],
    auth: { kind: "scrape" },
    canonical: true,
  },
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

export { fetchCoverFromCoverProject } from "./resolver";
export {
  buildCoverProjectCdnCandidates,
  fetchCoverFromCoverProjectCdn,
  slugCoverProjectTitle,
} from "./cdnLookup";
