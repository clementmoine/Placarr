import axios from "axios";

import { createMetadataHealthCheck, pingUrl } from "@/lib/provider/healthUtils";
import { metadataProbe } from "@/lib/dev/mappingProbe";
import { teardownMetadataWhen } from "@/lib/provider/teardownHelpers";

import type { ProviderModule } from "@/types/providerModule";
import type { MetadataProviderAdapter } from "@/types/providerModule";

import { createWikidataResolver } from "./resolver";

const fetchBoardGameFromWikidata = createWikidataResolver("boardgames");
const fetchGameFromWikidata = createWikidataResolver("games");

export const wikidataModule: ProviderModule = {
  info: {
    id: "wikidata",
    label: "Wikidata",
    types: ["games", "boardgames"],
    capabilities: ["identify", "description", "cover", "releaseDate", "people"],
    auth: { kind: "none" },
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
        return type === "games"
          ? fetchGameFromWikidata(name)
          : fetchBoardGameFromWikidata(name);
      },
    } satisfies MetadataProviderAdapter;
  },
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
  testHandlers: {
    "wikidata-metadata": {
      label: "Wikidata - Metadata",
      kind: "metadata",
      run: (query) => fetchBoardGameFromWikidata(query),
    },
  },
  buildTeardownMetadataTasks(ctx) {
    return teardownMetadataWhen(
      ctx,
      "Wikidata",
      () =>
        ctx.type === "games"
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
    try {
      const response = await axios.get(
        "https://www.wikidata.org/wiki/Special:EntityData/Q17271.json",
        {
          headers: { "User-Agent": "Placarr/1.0" },
          timeout: 8000,
        },
      );
      const entity = response.data?.entities?.Q17271;
      return [
        ...Object.keys(entity?.labels || {}),
        ...Object.keys(entity?.descriptions || {}),
        ...Object.keys(entity?.claims || {}),
      ];
    } catch {
      return [];
    }
  },
};

export { createWikidataResolver };
