import { describe, expect, it } from "vitest";

import { METADATA_OBSERVATION_SCHEMA_VERSION } from "@/lib/metadataObservations";

import { mapOkkazeoMetadata } from "./resolver";

describe("mapOkkazeoMetadata observations", () => {
  it("emits catalog observations without dropping the legacy metadata shape", () => {
    const metadata = mapOkkazeoMetadata({
      title: "Mille Sabords",
      description: "Un jeu de dés pirate.",
      imageUrl: "https://www.okkazeo.com/images/jeux/10267_1.jpg",
      barcode: "3421272109517",
      players: "2 à 5 joueurs",
      playtime: "30 mn",
      ageRating: "8+",
      year: "2013",
      categories: ["Jeu de dés", "Pirates"],
      priceCents: 500,
      productUrl: "https://www.okkazeo.com/jeux/10267/mille-sabords",
    });

    expect(metadata).toMatchObject({
      title: "Mille Sabords",
      imageUrl: "https://www.okkazeo.com/images/jeux/10267_1.jpg",
      barcode: "3421272109517",
      regionalTitles: [{ region: "fr", text: "Mille Sabords" }],
      observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
    });

    expect(metadata.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "title",
          role: "catalog_title",
          value: "Mille Sabords",
          provenance: expect.objectContaining({
            providerId: "okkazeo",
            sourceDocumentRole: "catalog_product",
            evidenceSignals: ["structured_data", "barcode_match"],
          }),
          usage: expect.objectContaining({
            displayCandidate: true,
            searchAlias: "strong",
            evidence: "strong",
          }),
        }),
        expect.objectContaining({
          kind: "image",
          role: "cover_front",
          url: "https://www.okkazeo.com/images/jeux/10267_1.jpg",
        }),
        expect.objectContaining({
          kind: "fact",
          role: "structured_fact",
          factKind: "players",
          value: "2 à 5 joueurs",
        }),
        expect.objectContaining({
          kind: "offer",
          role: "price_snapshot",
          priceCents: 500,
          currency: "EUR",
          provenance: expect.objectContaining({
            sourceDocumentRole: "offer",
          }),
          usage: expect.objectContaining({
            displayCandidate: false,
            searchAlias: "none",
            evidence: "weak",
          }),
        }),
      ]),
    );
  });
});
