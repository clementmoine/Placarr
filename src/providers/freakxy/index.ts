import type { BarcodeLookupType } from "@/types/providerModule";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";
import { probeBarcodesWithFallback, listProbe } from "@/lib/dev/mappingProbe";
import {
  mappingRawKeysFromFetch,
  probeContextOrDefault,
} from "@/lib/dev/mappingRawKeys";
import {
  marketplaceContributions,
  typedOnlyContributions,
} from "@/core/identify/lookup/sourceContribution";
import { matchPrimaryBarcode } from "@/core/catalog/matchContext";
import { pricedOffers } from "@/core/catalog/priceOffers";
import { defineProvider } from "@/providers/shared/defineProvider";

import { fetchFromFreakxy, freakxySearchUrl, type FreakxyProduct } from "./fetch";
import { readFreakxySearchEvidence } from "./durableEvidence";

export { fetchFromFreakxy };

const FALLBACK_QUERIES = ["0045496365226", "045496360730", "Mario Kart Wii"];

const BARCODE_TYPES: BarcodeLookupType[] = ["games", "hardware", "generic"];
const PRICE_SOURCE = "Freakxy";
const PRICE_SHELF_TYPES = new Set(["games", "hardware"]);

function freakxyOffersFromHits(hits: FreakxyProduct[]) {
  const priced = hits.find(
    (hit) => typeof hit.priceCents === "number" && hit.priceCents > 0,
  );
  if (!priced?.priceCents) return [];
  return pricedOffers(PRICE_SOURCE, [
    {
      condition: "new",
      priceCents: priced.priceCents,
      rawValue: priced,
      extra: {
        productName: priced.name,
        ...(priced.sourceUrl ? { sourceUrl: priced.sourceUrl } : {}),
        ...(priced.coverUrl ? { coverUrl: priced.coverUrl } : {}),
      },
    },
  ]);
}

async function refreshFreakxyOffers(ctx: BarcodePriceRefreshContext) {
  if (!PRICE_SHELF_TYPES.has(ctx.shelfType)) return [];
  const barcode = matchPrimaryBarcode(ctx) || ctx.cleanedBarcode;
  if (!barcode) return [];
  if (ctx.evidenceOnly) {
    const cached = await readFreakxySearchEvidence(freakxySearchUrl(barcode));
    return freakxyOffersFromHits(cached ?? []);
  }
  const hits = await fetchFromFreakxy(barcode);
  return freakxyOffersFromHits(hits);
}

export const freakxyModule = defineProvider({
  info: {
    id: "freakxy",
    label: "Freakxy",
    types: ["games", "hardware"],
    capabilities: ["identify", "price"],
    auth: { kind: "scrape" },
    supplyMode: "scrape_cache",
    canonical: false,
    defaultLanguage: "fr",
    isRealBoxCover: true,
    slowBarcodeLookup: true,
    evidenceOnlyPriceRefresh: true,
    websiteUrl: "https://www.freakxy.fr/",
    notes:
      "Boutique Magento FR — jeux + consoles/manettes (EAN) : identify + prix neuf EUR.",
  },
  evidence: {
    label: "Freakxy",
    sourceWeight: 0.1,
  },
  buildBarcodeTasks(deps, type, { barcode }) {
    if (!BARCODE_TYPES.includes(type)) {
      return {} as Record<string, Promise<unknown>>;
    }
    return { freakxy: deps.fetchFromFreakxy(barcode) };
  },
  contributeBarcodeLookupDeps: () => ({
    fetchFromFreakxy,
  }),
  testHandlers: {
    "freakxy-barcode": {
      label: "Freakxy - Barcode",
      kind: "scraped-list",
      run: (query) => fetchFromFreakxy(query),
    },
  },
  mappingProbe: {
    sampleInput: "0045496365226",
    context: { name: "", barcode: "0045496365226" },
    fallbackBarcodes: FALLBACK_QUERIES,
  },
  runMappingProbe: () =>
    probeBarcodesWithFallback(
      FALLBACK_QUERIES,
      fetchFromFreakxy,
      listProbe,
      "Freakxy",
      { retryAttempts: 2, unreachableStatus: "blocked" },
    ),
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: "",
      barcode: FALLBACK_QUERIES[0],
    });
    return mappingRawKeysFromFetch(() =>
      fetchFromFreakxy(ctx.barcode || FALLBACK_QUERIES[0]),
    );
  },
  barcodeLookupSlots: { freakxy: () => [] },
  buildBarcodeSources(payload, ctx) {
    return [
      ...marketplaceContributions("Freakxy", payload.freakxy, ctx, ["games"]),
      ...typedOnlyContributions("Freakxy", payload.freakxy, ctx, ["hardware"]),
    ];
  },
  extractScanPriceOffers(payload, shelfType) {
    if (!PRICE_SHELF_TYPES.has(shelfType) || !payload.freakxy?.length) {
      return [];
    }
    return freakxyOffersFromHits(payload.freakxy);
  },
  refreshBarcodePriceOffers: refreshFreakxyOffers,
});

import type { NamedListing } from "@/core/identify/gameLookup";

// This module owns the `freakxy` barcode-lookup slot: it declares its type here
// and its empty value in `info.barcodeLookupSlots`, so core enumerates none.
declare module "@/core/identify/lookup/payload" {
  interface BarcodeLookupSlots {
    freakxy: NamedListing[];
  }
}
