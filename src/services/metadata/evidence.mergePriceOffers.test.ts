import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  priceOffer: {
    findMany: vi.fn(),
    deleteMany: vi.fn(() => ({ __op: "delete" })),
    createMany: vi.fn((args: unknown) => ({ __op: "create", args })),
  },
  $transaction: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

import { mergePriceOffers } from "./evidence";

function dbOffer(overrides: Record<string, unknown>) {
  return {
    id: 1,
    source: "X",
    productName: null,
    merchantName: null,
    condition: null,
    priceCents: 0,
    currency: "EUR",
    shippingCents: null,
    totalCents: null,
    sourceUrl: null,
    availability: null,
    offerCount: null,
    rawValue: null,
    observedAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

function lastCreatedRows() {
  const call = prismaMock.priceOffer.createMany.mock.calls.at(-1);
  return (call?.[0] as { data: any[] }).data;
}

describe("mergePriceOffers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves a provider's offer when it didn't report this time", async () => {
    prismaMock.priceOffer.findMany.mockResolvedValue([
      dbOffer({
        source: "PriceCharting",
        condition: "loose",
        priceCents: 1000,
      }),
      dbOffer({ source: "LeDenicheur", condition: "new", priceCents: 5000 }),
    ]);

    // Only PriceCharting answered on this refresh.
    const merged = await mergePriceOffers({ barcodeCacheId: 42 }, [
      { source: "PriceCharting", condition: "loose", priceCents: 1200 },
    ]);

    const ledenicheur = merged.find((o) => o.source === "LeDenicheur");
    const priceCharting = merged.find((o) => o.source === "PriceCharting");
    // LeDenicheur kept its previous value (no data loss).
    expect(ledenicheur?.priceCents).toBe(5000);
    // PriceCharting overwritten with the fresh value.
    expect(priceCharting?.priceCents).toBe(1200);

    const rows = lastCreatedRows();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.barcodeCacheId === 42)).toBe(true);
  });

  it("keeps everything when the refresh batch is empty", async () => {
    prismaMock.priceOffer.findMany.mockResolvedValue([
      dbOffer({
        source: "PriceCharting",
        condition: "loose",
        priceCents: 1000,
      }),
    ]);

    const merged = await mergePriceOffers({ barcodeCacheId: 7 }, []);

    expect(merged).toHaveLength(1);
    expect(merged[0].priceCents).toBe(1000);
    expect(lastCreatedRows()).toHaveLength(1);
  });

  it("ignores invalid incoming offers (zero / non-integer price)", async () => {
    prismaMock.priceOffer.findMany.mockResolvedValue([
      dbOffer({ source: "PriceCharting", condition: "new", priceCents: 2000 }),
    ]);

    const merged = await mergePriceOffers({ barcodeCacheId: 9 }, [
      { source: "eBay", condition: "used", priceCents: 0 },
      { source: "Smartoys", condition: "new", priceCents: 12.5 },
    ]);

    // Neither invalid offer is added; the existing one survives.
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe("PriceCharting");
  });
});
