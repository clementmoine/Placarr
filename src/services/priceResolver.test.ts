import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  barcodeCache: {
    findUnique: vi.fn(),
  },
  priceOffer: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    barcodeCache: h.barcodeCache,
    priceOffer: h.priceOffer,
  },
}));

import { getCachedBarcodePrices } from "@/services/priceResolver";

function offer(overrides: Record<string, unknown>) {
  return {
    source: "PriceCharting",
    productName: null,
    merchantName: null,
    condition: "loose",
    priceCents: 1200,
    currency: "EUR",
    sourceUrl: null,
    offerCount: null,
    observedAt: new Date("2026-06-19T12:00:00.000Z"),
    ...overrides,
  };
}

describe("getCachedBarcodePrices", () => {
  beforeEach(() => {
    h.barcodeCache.findUnique.mockReset();
    h.priceOffer.findMany.mockReset();
  });

  it("reads legacy item/metadata scoped offers during barcode cache migration", async () => {
    h.barcodeCache.findUnique.mockResolvedValue(null);
    h.priceOffer.findMany.mockResolvedValue([
      offer({ condition: "loose", priceCents: 1200 }),
      offer({ condition: "cib", priceCents: 1800 }),
    ]);

    const prices = await getCachedBarcodePrices("1234567890123", "games", {
      itemId: "item-1",
      metadataId: "meta-1",
    });

    expect(h.priceOffer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ itemId: "item-1" }, { metadataId: "meta-1" }] },
      }),
    );
    expect(prices?.priceUsed).toBe(1200);
    expect(prices?.priceUsedCIB).toBe(1800);
    expect(prices?.priceSources).toEqual(["PriceCharting"]);
  });

  it("keeps barcode summary values when observations miss a condition", async () => {
    h.barcodeCache.findUnique.mockResolvedValue({
      id: 42,
      shelfType: "games",
      provider: "PriceCharting+LeDenicheur",
      priceNew: null,
      priceUsed: 900,
      priceUsedCIB: 1400,
      priceLastUpdated: new Date("2026-06-19T11:00:00.000Z"),
    });
    h.priceOffer.findMany.mockResolvedValue([
      offer({
        source: "LeDenicheur",
        condition: "new",
        priceCents: 3596,
      }),
    ]);

    const prices = await getCachedBarcodePrices("1234567890123", "games");

    expect(prices?.priceNew).toBe(3596);
    expect(prices?.priceUsed).toBe(900);
    expect(prices?.priceUsedCIB).toBe(1400);
  });
});
