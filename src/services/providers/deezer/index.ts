import axios from "axios";

import { createMetadataHealthCheck, pingUrl } from "@/lib/providerHealthUtils";
import { createDeezerResolver } from "./resolver";

import type { BarcodeLookupType, ProviderModule } from "@/types/providerModule";
import type { MetadataProviderAdapter } from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";
import { teardownMetadataWhen } from "@/lib/providerTeardownHelpers";

type Resolver = (
  name: string,
  barcode?: string | null,
) => Promise<MetadataResult | null>;

const fetchFromDeezer = createDeezerResolver();

const BARCODE_TYPES: BarcodeLookupType[] = ["musics", "generic"];

export const deezerModule: ProviderModule = {
  info: {
    id: "deezer",
    label: "Deezer",
    types: ["musics"],
    nameDatabase: true,
    capabilities: ["identify", "cover", "releaseDate", "people", "tracksCount"],
    auth: { kind: "none" },
    canonical: true,
  },
  evidence: {
    label: "Deezer",
    sourceWeight: 0.44,
    canonical: true,
    cleanCachedNames: true,
  },
  buildBarcodeTasks(deps, type, { barcode }) {
    if (!BARCODE_TYPES.includes(type)) {
      return {} as Record<string, Promise<unknown>>;
    }
    return { deezer: deps.fetchFromDeezer("", barcode) };
  },
  healthCheck: createMetadataHealthCheck("deezer", "Deezer", async () => {
    const start = Date.now();
    const isUp = await pingUrl("https://api.deezer.com/infos");
    return {
      ok: isUp,
      latency: Date.now() - start,
      error: isUp ? null : "Host unreachable",
    };
  }),
  createMetadataAdapter() {
    return {
      id: "deezer",
      async resolve({ name, barcode }) {
        return fetchFromDeezer(name, barcode);
      },
    } satisfies MetadataProviderAdapter;
  },
  testHandlers: {
    "deezer-barcode": {
      label: "Deezer - Barcode",
      kind: "metadata-barcode",
      run: (query) => fetchFromDeezer("", query),
    },
    "deezer-metadata": {
      label: "Deezer - Metadata",
      kind: "metadata",
      run: (query) => fetchFromDeezer(query),
    },
  },
  buildTeardownMetadataTasks(ctx) {
    return teardownMetadataWhen(
      ctx,
      "Deezer",
      () => fetchFromDeezer(ctx.name, ctx.barcode),
      "musics",
    );
  },
  mappingProbe: {
    sampleInput: "Daft Punk Random Access Memories",
    context: { name: "Daft Punk Random Access Memories" },
  },
  collectMappingRawKeys: async () => {
    try {
      const search = await axios.get("https://api.deezer.com/search/album", {
        params: { q: "Daft Punk Random Access Memories" },
        timeout: 8000,
      });
      const id = search.data?.data?.[0]?.id;
      if (!id) return Object.keys(search.data?.data?.[0] || {});
      const album = await axios.get(`https://api.deezer.com/album/${id}`, {
        timeout: 8000,
      });
      return Object.keys(album.data || {});
    } catch {
      return [];
    }
  },
};

export { createDeezerResolver };
