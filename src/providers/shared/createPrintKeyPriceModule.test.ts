import { describe, expect, it, vi } from "vitest";

import {
  createPrintKeyPriceModule,
  createPrintKeyPriceRefresh,
  dualFinishPriceRows,
  printKeyFromPriceContext,
} from "@/providers/shared/createPrintKeyPriceModule";
import { lorcanaPromoSetFromGrouping } from "@/providers/shared/lorcanaPromoSet";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";

describe("lorcanaPromoSetFromGrouping", () => {
  it("maps pN groupings to PN set codes", () => {
    expect(lorcanaPromoSetFromGrouping("p2")).toBe("P2");
    expect(lorcanaPromoSetFromGrouping("P3")).toBe("P3");
    expect(lorcanaPromoSetFromGrouping(null)).toBeNull();
    expect(lorcanaPromoSetFromGrouping("pd1")).toBeNull();
  });
});

describe("dualFinishPriceRows", () => {
  it("emits new and foil rows and skips nulls", () => {
    expect(
      dualFinishPriceRows({
        label: "Ariel",
        newCents: 120,
        foilCents: 450,
        sourceUrl: "https://example.test/a",
      }),
    ).toEqual([
      {
        condition: "new",
        priceCents: 120,
        productName: "Ariel",
        sourceUrl: "https://example.test/a",
      },
      {
        condition: "foil",
        priceCents: 450,
        productName: "Ariel (foil)",
        sourceUrl: "https://example.test/a",
      },
    ]);
    expect(
      dualFinishPriceRows({
        label: "Only foil",
        newCents: null,
        foilCents: 99,
      }),
    ).toEqual([
      {
        condition: "foil",
        priceCents: 99,
        productName: "Only foil (foil)",
      },
    ]);
  });
});

describe("createPrintKeyPriceRefresh", () => {
  const baseCtx = {
    shelfType: "tcg",
    printKey: "lorcana:1-1",
  } as BarcodePriceRefreshContext;

  it("reads printKey from context or externalIds", () => {
    expect(printKeyFromPriceContext(baseCtx)).toBe("lorcana:1-1");
    expect(
      printKeyFromPriceContext({
        ...baseCtx,
        printKey: undefined,
        externalIds: { printKey: "lorcana:2-2" },
      }),
    ).toBe("lorcana:2-2");
  });

  it("returns no offers off the tcg shelf or without a key", async () => {
    const fetchCard = vi.fn();
    const refresh = createPrintKeyPriceRefresh({
      priceSource: "Test",
      currency: "EUR",
      fetchCard,
      priceRows: () => [],
    });
    expect(await refresh({ ...baseCtx, shelfType: "book" })).toEqual([]);
    expect(
      await refresh({ shelfType: "tcg" } as BarcodePriceRefreshContext),
    ).toEqual([]);
    expect(fetchCard).not.toHaveBeenCalled();
  });

  it("filters by printGame and builds priced offers", async () => {
    const refresh = createPrintKeyPriceRefresh<{
      cm: number;
      foil: number;
    }>({
      priceSource: "TestSrc",
      currency: "EUR",
      printGame: "lorcana",
      fetchCard: async () => ({ cm: 100, foil: 200 }),
      priceRows: (card) =>
        dualFinishPriceRows({
          label: "Card",
          newCents: card.cm,
          foilCents: card.foil,
        }),
    });

    expect(
      await refresh({
        ...baseCtx,
        printKey: "pokemon:sv01-001",
      }),
    ).toEqual([]);

    const offers = await refresh(baseCtx);
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      source: "TestSrc",
      condition: "new",
      priceCents: 100,
      currency: "EUR",
      metadataScoped: true,
    });
    expect(offers[1]).toMatchObject({
      condition: "foil",
      priceCents: 200,
    });
  });
});

describe("createPrintKeyPriceModule", () => {
  it("exposes a price-only provider module", async () => {
    const priceModule = createPrintKeyPriceModule<{ n: number }>({
      providerId: "demo-price",
      label: "Demo",
      priceSource: "Demo",
      currency: "USD",
      notes: "test",
      mappingProbe: {
        sampleInput: "lorcana:1-1",
        context: { name: "Ariel", printKey: "lorcana:1-1" },
      },
      fetchCard: async () => ({ n: 50 }),
      priceRows: (card) => [
        { condition: "new", priceCents: card.n, productName: "X" },
      ],
    });

    expect(priceModule.info.capabilities).toEqual(["price"]);
    expect(priceModule.info.id).toBe("demo-price");
    const offers = await priceModule.refreshBarcodePriceOffers!({
      shelfType: "tcg",
      printKey: "lorcana:1-1",
    } as BarcodePriceRefreshContext);
    expect(offers).toHaveLength(1);
    expect(offers[0]?.priceCents).toBe(50);
  });
});
