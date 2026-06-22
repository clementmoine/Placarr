import type { BarcodeLookupType, ProviderModule } from "@/types/providerModule";
import { listProbe } from "@/lib/mappingProbeUtils";

import {
  fetchFromAchatMoinsCher,
  fetchPricesFromAchatMoinsCher,
} from "./fetch";

export { fetchFromAchatMoinsCher, fetchPricesFromAchatMoinsCher };

const BARCODE_TYPES: BarcodeLookupType[] = [
  "games",
  "books",
  "musics",
  "movies",
  "boardgames",
  "generic",
];

export const achatmoinscherModule: ProviderModule = {
  info: {
    id: "achatmoinscher",
    label: "AchatMoinsCher",
    types: ["games", "movies", "musics", "books", "boardgames"],
    capabilities: ["identify", "price", "cover"],
    // The metadata adapter only returns title + cover; price is served by the
    // separate barcode/price-task flow. Without this, the metadata price-chase
    // would scrape AchatMoinsCher even when title + cover are already present.
    metadataCapabilities: ["identify", "cover"],
    auth: { kind: "scrape" },
    canonical: false,
  },
  evidence: {
    label: "AchatMoinsCher",
    sourceWeight: 0.12,
  },
  createMetadataAdapter() {
    return {
      id: "achatmoinscher",
      async resolve({ barcode }: any) {
        if (!barcode) return null;
        const products = await fetchFromAchatMoinsCher(barcode);
        const product = products[0];
        if (!product?.name) return null;
        return {
          title: product.name,
          barcode,
          imageUrl: product.coverUrl || undefined,
          attachments: product.coverUrl
            ? [{ type: "cover" as any, url: product.coverUrl, source: "achatmoinscher" }]
            : undefined,
        };
      },
    } satisfies any;
  },
  buildBarcodeTasks(deps, type, { barcode }) {
    if (!BARCODE_TYPES.includes(type)) {
      return {} as Record<string, Promise<unknown>>;
    }
    return { amc: deps.fetchFromAchatMoinsCher(barcode) };
  },
  testHandlers: {
    "achatmoinscher-barcode": {
      label: "AchatMoinsCher - Barcode",
      kind: "scraped-list",
      run: (query) => fetchFromAchatMoinsCher(query),
    },
  },
  mappingProbe: {
    sampleInput: "9782070368228",
    context: { name: "", barcode: "9782070368228" },
  },
  runMappingProbe: async () =>
    listProbe(await fetchFromAchatMoinsCher("9782070368228")),
};
