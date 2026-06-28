import { describe, expect, it } from "vitest";

import type { ProductEvidence } from "./types";
import {
  barcodeEvidenceRankScore,
  barcodeEvidenceTier,
  barcodeSourceDocumentRole,
  barcodeTitleRole,
  compareBarcodeEvidenceByObservationRank,
  compareBarcodeEvidenceByRank,
  compareBarcodeEvidenceByImageObservationRank,
  observationsFromProductEvidence,
} from "./observations";

function evidence(
  overrides: Partial<ProductEvidence> & Pick<ProductEvidence, "providerName">,
): ProductEvidence {
  return {
    rawName: "Test Game",
    cleanName: "Test Game",
    title: "Test Game",
    coverUrl: null,
    isAlias: false,
    region: null,
    priority: 1,
    sourceWeight: 0.2,
    isCanonical: false,
    isTrustedRetailer: false,
    parsed: {
      rawName: "Test Game",
      cleanName: "Test Game",
      title: "Test Game",
      normalizedTitle: "test game",
      tokens: new Set(["test", "game"]),
      indicators: new Set(),
    },
    ...overrides,
  };
}

describe("barcodeEvidenceTier", () => {
  it("classe canonical > trusted retailer > marketplace", () => {
    const canonical = evidence({
      providerName: "ScreenScraper",
      isCanonical: true,
      sourceWeight: 0.1,
    });
    const trusted = evidence({
      providerName: "Philibert",
      isTrustedRetailer: true,
      sourceWeight: 0.9,
    });
    const marketplace = evidence({
      providerName: "PicClick",
      sourceWeight: 0.99,
    });

    expect(barcodeEvidenceTier(canonical)).toBeGreaterThan(
      barcodeEvidenceTier(trusted),
    );
    expect(barcodeEvidenceTier(trusted)).toBeGreaterThan(
      barcodeEvidenceTier(marketplace),
    );
    expect(compareBarcodeEvidenceByRank(canonical, trusted)).toBeLessThan(0);
    expect(compareBarcodeEvidenceByRank(trusted, marketplace)).toBeLessThan(0);
  });

  it("départage à poids égal dans le même tier", () => {
    const heavy = evidence({ providerName: "A", sourceWeight: 0.4 });
    const light = evidence({ providerName: "B", sourceWeight: 0.1 });
    expect(barcodeEvidenceRankScore(heavy)).toBeGreaterThan(
      barcodeEvidenceRankScore(light),
    );
  });

  it("aligne le tri observationnel sur le tri tier legacy", () => {
    const canonical = evidence({
      providerName: "ScreenScraper",
      isCanonical: true,
      sourceWeight: 0.1,
    });
    const trusted = evidence({
      providerName: "Philibert",
      isTrustedRetailer: true,
      sourceWeight: 0.9,
    });
    const marketplace = evidence({
      providerName: "PicClick",
      sourceWeight: 0.99,
    });

    expect(
      compareBarcodeEvidenceByObservationRank(canonical, trusted),
    ).toBeLessThan(0);
    expect(
      compareBarcodeEvidenceByObservationRank(trusted, marketplace),
    ).toBeLessThan(0);
    expect(
      compareBarcodeEvidenceByObservationRank(canonical, marketplace),
    ).toBeLessThan(0);
  });

  it("préfère une couverture trusted/canonical via le ranking image observationnel", () => {
    const trusted = evidence({
      providerName: "Philibert",
      isTrustedRetailer: true,
      coverUrl: "https://example.test/catalog.jpg",
      sourceWeight: 0.2,
    });
    const marketplace = evidence({
      providerName: "PicClick",
      coverUrl: "https://example.test/listing.jpg",
      sourceWeight: 0.99,
    });
    expect(
      compareBarcodeEvidenceByImageObservationRank(trusted, marketplace),
    ).toBeLessThan(0);
  });

  it("limite le tie-break sourceWeight au sein d'un même tier listing", () => {
    const heavy = evidence({
      providerName: "PicClick",
      sourceWeight: 0.99,
    });
    const light = evidence({
      providerName: "LeBonCoin",
      sourceWeight: 0.05,
    });
    const rankDiff = compareBarcodeEvidenceByObservationRank(heavy, light);
    expect(Math.abs(rankDiff)).toBeLessThan(0.1);
    expect(rankDiff).toBeLessThan(0);
  });
});

describe("observationsFromProductEvidence", () => {
  it("émet titre catalogue pour un retailer de confiance", () => {
    const rows = observationsFromProductEvidence(
      evidence({
        providerName: "Apriloshop",
        isTrustedRetailer: true,
        coverUrl: "https://example.com/cover.jpg",
      }),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      kind: "title",
      role: "catalog_title",
      value: "Test Game",
      provenance: {
        providerId: "apriloshop",
        providerLabel: "Apriloshop",
        sourceDocumentRole: "catalog_product",
      },
    });
    expect(rows[1]).toMatchObject({
      kind: "image",
      role: "cover_front",
      url: "https://example.com/cover.jpg",
    });
  });

  it("émet object_title pour une source canonique", () => {
    expect(
      barcodeTitleRole(
        evidence({ providerName: "ScreenScraper", isCanonical: true }),
      ),
    ).toBe("object_title");
    expect(
      barcodeSourceDocumentRole(
        evidence({ providerName: "ScreenScraper", isCanonical: true }),
      ),
    ).toBe("reference_record");
  });

  it("émet des observations fact pour un retailer de confiance", () => {
    const rows = observationsFromProductEvidence(
      evidence({
        providerName: "Philibert",
        isTrustedRetailer: true,
        facts: [
          { kind: "players", label: "Joueurs", value: "3 à 4" },
          { kind: "playtime", label: "Durée", value: "60 min" },
        ],
      }),
    );

    expect(rows.filter((row) => row.kind === "fact")).toEqual([
      expect.objectContaining({
        kind: "fact",
        role: "structured_fact",
        factKind: "players",
        value: "3 à 4",
      }),
      expect.objectContaining({
        kind: "fact",
        role: "structured_fact",
        factKind: "playtime",
        value: "60 min",
      }),
    ]);
  });
});
