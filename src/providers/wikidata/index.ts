import { createMetadataHealthCheck, pingUrl } from "@/core/catalog/healthUtils";
import { metadataProbe } from "@/lib/dev/mappingProbe";
import { collectObjectMappingSignals } from "@/lib/dev/scrapeMappingSignals";
import { teardownMetadataWhen } from "@/core/catalog/teardownHelpers";
import { defineProvider } from "@/providers/shared/defineProvider";

import type { MetadataProviderAdapter } from "@/types/providerModule";

import { createWikidataResolver } from "./resolver";

const fetchBoardGameFromWikidata = createWikidataResolver("boardgames");
const fetchGameFromWikidata = createWikidataResolver("games");

export const wikidataModule = defineProvider({
  info: {
    id: "wikidata",
    label: "Wikidata",
    types: ["games", "boardgames"],
    capabilities: ["identify", "description", "cover", "releaseDate", "people"],
    auth: { kind: "none" },
    supplyMode: "api_live",
    canonical: true,
    websiteUrl: "https://www.wikidata.org/",
    notes: "Descriptions FR via Wikipedia/Wikidata (jeux de société).",
  },
  evidence: {
    label: "Wikidata",
    sourceWeight: 0.36,
    canonical: true,
    cleanCachedNames: true,
  },
  createMetadataAdapter() {
    return {
      id: "wikidata",
      async resolve({ name, type }) {
        return type === "game"
          ? fetchGameFromWikidata(name)
          : fetchBoardGameFromWikidata(name);
      },
    } satisfies MetadataProviderAdapter;
  },
  // Ping API avec User-Agent (Wikidata exige un UA identifiable).
  healthCheck: createMetadataHealthCheck("wikidata", "Wikidata", async () => {
    const start = Date.now();
    const isUp = await pingUrl(
      "https://www.wikidata.org/w/api.php?action=wbsearchentities&search=test&format=json",
      { headers: { "User-Agent": "Placarr/1.0" } },
    );
    return {
      ok: isUp,
      latency: Date.now() - start,
      error: isUp ? null : "Host unreachable",
    };
  }),
  metadataSearch: (query) => fetchBoardGameFromWikidata(query),
  buildTeardownMetadataTasks(ctx) {
    return teardownMetadataWhen(
      ctx,
      "Wikidata",
      () =>
        ctx.type === "game"
          ? fetchGameFromWikidata(ctx.name)
          : fetchBoardGameFromWikidata(ctx.name),
      ctx.type,
    );
  },
  mappingProbe: {
    sampleInput: "Catan",
    context: { name: "Catan" },
  },
  runMappingProbe: async () =>
    metadataProbe(await fetchBoardGameFromWikidata("Catan")),
  collectMappingRawKeys: async () => {
    const metadata = await fetchBoardGameFromWikidata("Catan");
    if (!metadata) return [];
    return collectObjectMappingSignals({
      title: metadata.title,
      description: metadata.description,
      imageUrl: metadata.imageUrl,
      releaseDate: metadata.releaseDate,
      authors: metadata.authors,
      publishers: metadata.publishers,
      attachments: metadata.attachments,
      aliases: metadata.aliases,
      regionalTitles: metadata.regionalTitles,
      facts: metadata.facts,
      externalIds: metadata.externalIds,
    });
  },
});

export { createWikidataResolver };
