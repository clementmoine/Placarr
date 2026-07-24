import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchPhilibertProduct = vi.fn();
const searchPhilibert = vi.fn();
const fetchPhilibertBarcodeProduct = vi.fn();
const resolvePhilibertBackgroundUrl = vi.fn();
const readRetailPriceEvidence = vi.fn();
const promoteRetailPriceEvidence = vi.fn();

vi.mock("./fetch", () => ({
  fetchPhilibertBarcodeProduct: (...args: unknown[]) =>
    fetchPhilibertBarcodeProduct(...args),
  fetchPhilibertProduct: (...args: unknown[]) => fetchPhilibertProduct(...args),
  searchPhilibert: (...args: unknown[]) => searchPhilibert(...args),
  searchPhilibertHits: vi.fn(),
  resolvePhilibertBackgroundUrl: (...args: unknown[]) =>
    resolvePhilibertBackgroundUrl(...args),
}));

vi.mock("@/core/enrich/retailPriceEvidence", () => ({
  readRetailPriceEvidence: (...args: unknown[]) =>
    readRetailPriceEvidence(...args),
  promoteRetailPriceEvidence: (...args: unknown[]) =>
    promoteRetailPriceEvidence(...args),
}));

import { PROVIDER_MODULES } from "@/core/catalog/catalog";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";
import type { BarcodeLookupPayload } from "@/core/identify/lookup/payload";
import { createEmptyBarcodeLookupPayload } from "@/core/identify/lookup/payload";

const philibertModule = PROVIDER_MODULES.find(
  (module) => module.info.id === "philibert",
)!;

function refreshCtx(
  overrides: Partial<BarcodePriceRefreshContext> = {},
): BarcodePriceRefreshContext {
  return {
    shelfType: "boardgames",
    cleanedBarcode: "3558380126133",
    primaryName: "Catan",
    fallbackNames: [],
    leDenicheurQueries: [],
    isPal: false,
    isClassics: false,
    ...overrides,
  };
}

describe("philibert extractScanPriceOffers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    promoteRetailPriceEvidence.mockResolvedValue(undefined);
  });

  it("keeps sourceUrl from the barcode DetailYield", () => {
    const payload: BarcodeLookupPayload = {
      ...createEmptyBarcodeLookupPayload(),
      philibert: {
        title: "Catan",
        priceCents: 4590,
        productUrl:
          "https://www.philibertnet.com/fr/kosmos/10772-catane-3558380126133.html",
      },
    };

    const offers = philibertModule.extractScanPriceOffers!(payload, "boardgames");
    expect(offers).toHaveLength(1);
    expect(offers[0]?.sourceUrl).toContain("philibertnet.com");
    expect(offers[0]?.priceCents).toBe(4590);
    expect(promoteRetailPriceEvidence).toHaveBeenCalled();
  });
});

describe("philibert refreshBarcodePriceOffers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readRetailPriceEvidence.mockResolvedValue(null);
    promoteRetailPriceEvidence.mockResolvedValue(undefined);
  });

  it("reuses fresh ProviderEvidence without HTTP", async () => {
    readRetailPriceEvidence.mockResolvedValueOnce({
      priceCents: 4590,
      condition: "new",
      productName: "Catan",
      sourceUrl:
        "https://www.philibertnet.com/fr/kosmos/10772-catane-3558380126133.html",
    });

    const offers = await philibertModule.refreshBarcodePriceOffers!(
      refreshCtx({
        providerProductUrls: [
          {
            providerKey: "philibert",
            url: "https://www.philibertnet.com/fr/kosmos/10772-catane-3558380126133.html",
          },
        ],
      }),
    );

    expect(fetchPhilibertProduct).not.toHaveBeenCalled();
    expect(offers[0]?.priceCents).toBe(4590);
  });

  it("uses stored product URL before barcode search", async () => {
    fetchPhilibertProduct.mockResolvedValue({
      title: "Catan",
      priceCents: 4590,
      productUrl:
        "https://www.philibertnet.com/fr/kosmos/10772-catane-3558380126133.html",
    });

    const offers = await philibertModule.refreshBarcodePriceOffers!(
      refreshCtx({
        providerProductUrls: [
          {
            providerKey: "philibert",
            url: "https://www.philibertnet.com/fr/kosmos/10772-catane-3558380126133.html",
          },
        ],
      }),
    );

    expect(fetchPhilibertProduct).toHaveBeenCalledWith(
      "https://www.philibertnet.com/fr/kosmos/10772-catane-3558380126133.html",
    );
    expect(fetchPhilibertBarcodeProduct).not.toHaveBeenCalled();
    expect(offers).toHaveLength(1);
    expect(offers[0]?.sourceUrl).toContain("philibertnet.com");
    expect(promoteRetailPriceEvidence).toHaveBeenCalled();
  });

  it("falls back to barcode product when no stored URL resolves", async () => {
    fetchPhilibertBarcodeProduct.mockResolvedValue({
      title: "Catan",
      priceCents: 4200,
      productUrl:
        "https://www.philibertnet.com/fr/kosmos/10772-catane-3558380126133.html",
    });

    const offers = await philibertModule.refreshBarcodePriceOffers!(
      refreshCtx(),
    );

    expect(fetchPhilibertBarcodeProduct).toHaveBeenCalledWith("3558380126133");
    expect(offers).toHaveLength(1);
    expect(offers[0]?.sourceUrl).toContain("philibertnet.com");
  });
});
