import { describe, expect, it } from "vitest";

import {
  mergeMetadataPricesIntoResult,
  parseCatalogEstimatePricing,
  parseEuroRangeCents,
  priceObservationsFromMetadataFacts,
} from "@/core/commerce/pricing/metadataPriceObservations";
import type { BarcodePricesResult } from "@/core/commerce/pricing/resolver";

describe("parseEuroRangeCents", () => {
  it("parses french bedetheque estimate ranges", () => {
    expect(parseEuroRangeCents("de 5 à 10 euros")).toEqual({
      minCents: 500,
      maxCents: 1000,
    });
  });
});

describe("parseCatalogEstimatePricing", () => {
  it("parses ceiling estimates", () => {
    expect(parseCatalogEstimatePricing("moins de 5 euros")).toEqual({
      maxCents: 500,
      displayValue: "moins de 5 euros",
    });
  });

  it("parses floor estimates", () => {
    expect(parseCatalogEstimatePricing("plus de 20 €")).toEqual({
      minCents: 2000,
      displayValue: "plus de 20 €",
    });
  });

  it("ignores absent catalog estimates", () => {
    expect(parseCatalogEstimatePricing("non coté")).toBeNull();
    expect(parseCatalogEstimatePricing("non côté")).toBeNull();
  });
});

describe("priceObservationsFromMetadataFacts", () => {
  it("maps catalog price facts to metadata-scoped observations", () => {
    const observations = priceObservationsFromMetadataFacts([
      {
        kind: "price",
        label: "Estimation",
        value: "de 5 à 10 euros",
        source: "bedetheque",
      },
      {
        kind: "price",
        label: "Neuf dès",
        value: "7,30 €",
        source: "booknode",
      },
      {
        kind: "price",
        label: "Occasion dès",
        value: "11,00 €",
        source: "booknode",
      },
    ]);

    expect(observations).toHaveLength(3);
    expect(observations.find((entry) => entry.condition === "estimated")).toMatchObject({
      source: "bedetheque",
      metadataScoped: true,
      catalogEstimateMinCents: 500,
      catalogEstimateMaxCents: 1000,
    });
    expect(
      priceObservationsFromMetadataFacts([
        {
          kind: "price",
          label: "Estimation",
          value: "moins de 5 euros",
          source: "bedetheque",
        },
      ]).find((entry) => entry.condition === "estimated"),
    ).toMatchObject({
      source: "bedetheque",
      catalogEstimateMaxCents: 500,
      catalogEstimateDisplayValue: "moins de 5 euros",
    });
    expect(
      priceObservationsFromMetadataFacts([
        {
          kind: "price",
          label: "Estimation",
          value: "non coté",
          source: "bedetheque",
        },
      ]),
    ).toEqual([]);
    expect(observations.find((entry) => entry.condition === "new")?.priceCents).toBe(
      730,
    );
    expect(observations.find((entry) => entry.condition === "used")?.priceCents).toBe(
      1100,
    );
  });
});

describe("mergeMetadataPricesIntoResult", () => {
  it("resolves catalog-only prices through the shared consensus path", () => {
    const merged = mergeMetadataPricesIntoResult({
      shelfType: "books",
      shelfName: "BD",
      itemNames: ["Super Picsou Géant n°01"],
      metadataFacts: [
        {
          kind: "price",
          label: "Occasion dès",
          value: "11,00 €",
          source: "booknode",
        },
        {
          kind: "price",
          label: "Estimation",
          value: "de 5 à 10 euros",
          source: "bedetheque",
        },
      ],
      prices: null,
    });

    expect(merged?.priceUsed).toBe(1100);
    expect(merged?.priceSources).toContain("booknode");
    expect(merged?.priceSources).toContain("bedetheque");
    expect(
      merged?.priceObservations?.some(
        (observation) => observation.condition === "estimated",
      ),
    ).toBe(true);
  });

  it("surfaces ceiling-only catalog estimates when no marketplace prices exist", () => {
    const merged = mergeMetadataPricesIntoResult({
      shelfType: "books",
      shelfName: "Super Picsou Géant",
      itemNames: ["Super Picsou Géant n°28"],
      metadataFacts: [
        {
          kind: "price",
          label: "Estimation",
          value: "moins de 5 euros",
          source: "bedetheque",
        },
      ],
      prices: null,
    });

    expect(merged?.priceObservations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          condition: "estimated",
          source: "bedetheque",
          catalogEstimateDisplayValue: "moins de 5 euros",
          catalogEstimateMaxCents: 500,
        }),
      ]),
    );
    expect(merged?.priceSources).toContain("bedetheque");
  });

  it("keeps marketplace summary while attaching catalog observations as sources", () => {
    const observed: BarcodePricesResult = {
      priceNew: null,
      priceUsed: 1100,
      priceUsedCIB: null,
      priceLastUpdated: new Date("2026-01-01"),
      priceSources: ["ebay"],
      priceSourceDisplayNames: ["eBay"],
      isReferencePriceOnly: false,
      priceObservations: [
        {
          source: "ebay",
          productName: "Super Picsou Géant n°01",
          condition: "used",
          priceCents: 1100,
          currency: "EUR",
          sourceDisplayLabel: "eBay",
        },
      ],
    };

    const merged = mergeMetadataPricesIntoResult({
      shelfType: "books",
      shelfName: "BD",
      itemNames: ["Super Picsou Géant n°01"],
      metadataFacts: [
        {
          kind: "price",
          label: "Estimation",
          value: "de 5 à 10 euros",
          source: "bedetheque",
        },
      ],
      prices: observed,
    });

    expect(merged?.priceUsed).toBe(1100);
    expect(merged?.priceSources).toEqual(["ebay", "bedetheque"]);
    expect(merged?.priceObservations).toHaveLength(2);
  });
});
