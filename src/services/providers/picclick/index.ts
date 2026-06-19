import type { BarcodeLookupType, ProviderModule } from "@/types/providerModule";
import { listProbe } from "@/lib/mappingProbeUtils";

import { fetchFromPicClick } from "./fetch";

export { fetchFromPicClick };

const BARCODE_TYPES: BarcodeLookupType[] = [
  "games",
  "musics",
  "movies",
  "boardgames",
  "generic",
];

export const picclickModule: ProviderModule = {
  info: {
    id: "picclick",
    label: "PicClick (eBay)",
    types: ["games", "movies", "musics", "boardgames"],
    capabilities: ["identify", "price", "cover"],
    auth: { kind: "scrape" },
    canonical: false,
  },
  evidence: {
    label: "PicClick",
    sourceWeight: 0.08,
  },
  buildBarcodeTasks(deps, type, { barcode }) {
    if (!BARCODE_TYPES.includes(type)) {
      return {} as Record<string, Promise<unknown>>;
    }
    return { picclick: deps.fetchFromPicClick(barcode) };
  },
  testHandlers: {
    "picclick-barcode": {
      label: "PicClick - Barcode",
      kind: "scraped-list",
      run: (query) => fetchFromPicClick(query),
    },
  },
  mappingProbe: {
    sampleInput: "4988601467124",
    context: { name: "", barcode: "4988601467124" },
  },
  runMappingProbe: async () =>
    listProbe(await fetchFromPicClick("4988601467124")),
};
