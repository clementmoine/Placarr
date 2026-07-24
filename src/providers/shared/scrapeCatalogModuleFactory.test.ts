import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchShopifyBarcodeProduct = vi.fn();
const fetchShopifyProductByUrl = vi.fn();
const searchShopifyProduct = vi.fn();

vi.mock("@/providers/shopify/fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/providers/shopify/fetch")>();
  return {
    ...actual,
    fetchShopifyBarcodeProduct: (...args: unknown[]) =>
      fetchShopifyBarcodeProduct(...args),
    fetchShopifyProductByUrl: (...args: unknown[]) =>
      fetchShopifyProductByUrl(...args),
    searchShopifyProduct: (...args: unknown[]) => searchShopifyProduct(...args),
  };
});

import { PROVIDER_MODULES } from "@/core/catalog/catalog";
import {
  createEmptyBarcodeLookupPayload,
  type BarcodeLookupPayload,
} from "@/core/identify/lookup/payload";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";

const latelierdesjeuxModule = PROVIDER_MODULES.find(
  (module) => module.info.id === "latelierdesjeux",
)!;

const monsieurdeModule = PROVIDER_MODULES.find(
  (module) => module.info.id === "monsieurde",
)!;

function refreshCtx(
  overrides: Partial<BarcodePriceRefreshContext> = {},
): BarcodePriceRefreshContext {
  return {
    shelfType: "boardgames",
    cleanedBarcode: "3421272109517",
    primaryName: "Mille Sabords",
    fallbackNames: [],
    leDenicheurQueries: [],
    isPal: false,
    isClassics: false,
    ...overrides,
  };
}

describe("scrape catalog factory — scan DetailYield", () => {
  it("extracts Shopify scan offers with sourceUrl from retailer hits", () => {
    const payload: BarcodeLookupPayload = {
      ...createEmptyBarcodeLookupPayload(),
      retailers: [
        {
          providerId: "latelierdesjeux",
          providerName: "L'Atelier des Jeux",
          title: "Mille Sabords",
          priceCents: 2490,
          productUrl: "https://latelierdesjeux.fr/products/mille-sabords",
          types: ["boardgames"],
        },
      ],
    };

    const offers = latelierdesjeuxModule.extractScanPriceOffers!(
      payload,
      "boardgames",
    );
    expect(offers).toHaveLength(1);
    expect(offers[0]?.sourceUrl).toContain("/products/mille-sabords");
    expect(offers[0]?.priceCents).toBe(2490);
  });

  it("extracts PrestaShop scan offers with sourceUrl from retailer hits", () => {
    const payload: BarcodeLookupPayload = {
      ...createEmptyBarcodeLookupPayload(),
      retailers: [
        {
          providerId: "monsieurde",
          providerName: "Monsieur de",
          title: "Catan",
          priceCents: 4590,
          productUrl: "https://www.monsieurde.fr/catan.html",
          types: ["boardgames"],
        },
      ],
    };

    const offers = monsieurdeModule.extractScanPriceOffers!(
      payload,
      "boardgames",
    );
    expect(offers).toHaveLength(1);
    expect(offers[0]?.sourceUrl).toContain("monsieurde.fr");
  });
});

describe("scrape catalog factory — Shopify URL-first refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses a pinned product URL before barcode search", async () => {
    fetchShopifyProductByUrl.mockResolvedValue({
      title: "Mille Sabords",
      priceCents: 2490,
      productUrl: "https://latelierdesjeux.fr/products/mille-sabords",
    });

    const offers = await latelierdesjeuxModule.refreshBarcodePriceOffers!(
      refreshCtx({
        providerProductUrls: [
          {
            providerKey: "latelierdesjeux",
            url: "https://latelierdesjeux.fr/products/mille-sabords",
          },
        ],
      }),
    );

    expect(fetchShopifyProductByUrl).toHaveBeenCalled();
    expect(fetchShopifyBarcodeProduct).not.toHaveBeenCalled();
    expect(offers).toHaveLength(1);
    expect(offers[0]?.sourceUrl).toContain("latelierdesjeux.fr");
  });
});
