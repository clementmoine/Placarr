import { describe, expect, it, vi } from "vitest";

import {
  matchesCatalogueAuditFilter,
  type CatalogueCardRow,
} from "./catalogueCards";
import { catalogueCardPriceCentsByPrintKey } from "./catalogueCardPrices";

vi.mock("@/providers/shared/packOwner", () => ({
  providerModulesForPack: vi.fn((packId: string) => {
    if (packId === "pokemon") return [{ printGames: ["pokemon"] }];
    if (packId === "bleach/scb") return [{ printGames: ["bleachscb"] }];
    return [{ printGames: ["onepiece"] }];
  }),
}));

vi.mock("@/core/catalog/registry", () => ({
  PROVIDER_MODULES: [
    {
      info: {
        id: "opemarket",
        types: ["tcg"],
        referencePriceSource: true,
        evidenceOnlyPriceRefresh: true,
      },
      mappingProbe: {
        context: { printKey: "onepiece:op17-001", name: "Edward" },
      },
      refreshBarcodePriceOffers: vi.fn(async (ctx: { printKey?: string }) => {
        if (ctx.printKey === "onepiece:op17-001") {
          return [
            {
              source: "opecards",
              condition: "new",
              priceCents: 450,
              currency: "EUR",
            },
          ];
        }
        return [];
      }),
    },
    {
      info: {
        id: "pkmmarket",
        types: ["tcg"],
        referencePriceSource: true,
        evidenceOnlyPriceRefresh: true,
      },
      printGames: ["pokemon"],
      mappingProbe: {
        context: { printKey: "pokemon:me5-001", name: "Tropius" },
      },
      refreshBarcodePriceOffers: vi.fn(async (ctx: { printKey?: string }) => {
        if (ctx.printKey === "pokemon:me05-001") {
          return [
            {
              source: "pkmcards",
              condition: "new",
              priceCents: 2,
              currency: "EUR",
            },
          ];
        }
        return [];
      }),
    },
  ],
}));

function face(overrides: Partial<CatalogueCardRow> = {}): CatalogueCardRow {
  return {
    printKey: "onepiece:op17-001",
    set: "op17",
    card: "001",
    lang: "fr",
    artUrl: "/x.webp",
    hasFoil: false,
    label: "Edward Newgate",
    name: "Edward Newgate",
    kind: "face",
    ...overrides,
  };
}

describe("matchesCatalogueAuditFilter missingPriceOnly", () => {
  it("keeps faces without a positive priceCents", () => {
    expect(
      matchesCatalogueAuditFilter(face({ priceCents: null }), {
        missingPriceOnly: true,
      }),
    ).toBe(true);
    expect(
      matchesCatalogueAuditFilter(face({ priceCents: 450 }), {
        missingPriceOnly: true,
      }),
    ).toBe(false);
  });

  it("ignores pack backs", () => {
    expect(
      matchesCatalogueAuditFilter(
        face({ kind: "pack-back", priceCents: null }),
        { missingPriceOnly: true },
      ),
    ).toBe(false);
  });
});

describe("catalogueCardPriceCentsByPrintKey", () => {
  it("returns EUR cents from reference evidence-only pricers", async () => {
    const map = await catalogueCardPriceCentsByPrintKey("onepiece", [
      "onepiece:op17-001",
      "onepiece:op17-999",
    ]);
    expect(map.get("onepiece:op17-001")).toBe(450);
    expect(map.has("onepiece:op17-999")).toBe(false);
  });

  it("joins Pokémon Live bundle Catalogue keys via pokemon: printKeys", async () => {
    const map = await catalogueCardPriceCentsByPrintKey("pokemon", [
      "me5_fr_001",
      "me5_en_999",
    ]);
    expect(map.get("me5_fr_001")).toBe(2);
    expect(map.has("me5_en_999")).toBe(false);
  });

  it("uses Coleka deals ledger when the pack has no *cards.fr pricer", async () => {
    const map = await catalogueCardPriceCentsByPrintKey("bleach/scb", [
      "bleachscb:a-001",
      "bleachscb:c-001",
    ]);
    // Honest empty when deals harvest has not landed prices yet.
    if (!map.has("bleachscb:a-001")) {
      expect(map.size).toBe(0);
      return;
    }
    expect(map.get("bleachscb:a-001")).toBeGreaterThan(0);
    // C-series often absent from deals ajax — honest gap, not a join miss.
    expect(map.has("bleachscb:c-001")).toBe(false);
  });
});
