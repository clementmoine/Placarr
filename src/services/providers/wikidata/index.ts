import axios from "axios";

import {
  createMetadataHealthCheck,
  pingUrl,
} from "@/lib/providerHealthUtils";
import { metadataProbe } from "@/lib/mappingProbeUtils";
import { teardownMetadataWhen } from "@/lib/providerTeardownHelpers";

import type { ProviderModule } from "@/types/providerModule";
import type { MetadataProviderAdapter } from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";

import { createWikidataResolver } from "./resolver";

type Resolver = (name: string) => Promise<MetadataResult | null>;

const fetchFromWikidata = createWikidataResolver();

export const wikidataModule: ProviderModule = {
  info: {
    id: "wikidata",
    label: "Wikidata",
    types: ["boardgames"],
    capabilities: ["identify", "description", "cover", "releaseDate", "people"],
    auth: { kind: "none" },
    canonical: true,
    notes: "Descriptions FR via Wikipedia/Wikidata (jeux de société).",
  },
  evidence: {
    label: "Wikidata",
    sourceWeight: 0.36,
    canonical: true,
    cleanCachedNames: true,
  },
  createMetadataAdapter(deps) {
    const fetchFromWikidata = deps.fetchFromWikidata as Resolver;
    return {
      id: "wikidata",
      async resolve({ name }) {
        return fetchFromWikidata(name);
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
      run: (query) => fetchFromWikidata(query),
    },
  },
  buildTeardownMetadataTasks(ctx) {
    return teardownMetadataWhen(
      ctx,
      "Wikidata",
      () => fetchFromWikidata(ctx.name),
      "boardgames",
    );
  },
  mappingProbe: {
    sampleInput: "Catan",
    context: { name: "Catan" },
  },
  runMappingProbe: async () => metadataProbe(await fetchFromWikidata("Catan")),
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
