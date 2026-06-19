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
    auth: { kind: "scrape" },
    canonical: false,
  },
  evidence: {
    label: "AchatMoinsCher",
    sourceWeight: 0.12,
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
