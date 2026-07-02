import { describe, expect, it } from "vitest";

import { makeObservationUsage } from "@/lib/metadata/observations";
import type { MetadataObservation } from "@/types/metadataObservation";

import {
  compareImageObservations,
  pickBarcodeFieldValuesFromObservations,
  pickCoverUrlFromObservations,
  pickDisplayTitleFromObservations,
  rankFactObservations,
  titleObservationRankScore,
} from "./ranking";

function titleObservation(
  role: "object_title" | "catalog_title" | "listing_title",
  value: string,
  evidence: "strong" | "normal" | "weak",
  displayCandidate: boolean,
): MetadataObservation {
  return {
    kind: "title",
    role,
    value,
    provenance: {
      providerId: "test",
      sourceDocumentRole: "reference_record",
      evidenceSignals: ["barcode_match"],
    },
    usage: makeObservationUsage({
      displayCandidate,
      searchAlias: evidence,
      evidence,
    }),
  };
}

function imageObservation(
  role: "cover_front" | "listing_photo",
  url: string,
  evidence: "strong" | "weak",
): MetadataObservation {
  return {
    kind: "image",
    role,
    type: "cover",
    url,
    provenance: {
      providerId: "test",
      sourceDocumentRole: "catalog_product",
      evidenceSignals: ["barcode_match"],
    },
    usage: makeObservationUsage({
      displayCandidate: role === "cover_front",
      evidence,
    }),
  };
}

describe("pickDisplayTitleFromObservations", () => {
  it("préfère un object_title fort aux listing_title bruyants", () => {
    const title = pickDisplayTitleFromObservations([
      titleObservation("listing_title", "Mario Kart bruit marketplace", "weak", false),
      titleObservation("object_title", "Mario Kart Wii", "strong", true),
    ]);
    expect(title).toBe("Mario Kart Wii");
  });
});

describe("pickCoverUrlFromObservations", () => {
  it("préfère une cover_front à une listing_photo", () => {
    const url = pickCoverUrlFromObservations([
      imageObservation("listing_photo", "https://example.test/listing.jpg", "weak"),
      imageObservation("cover_front", "https://example.test/box.jpg", "strong"),
    ]);
    expect(url).toBe("https://example.test/box.jpg");
  });

  it("utilise urlQualityRank comme tie-break neutre", () => {
    const url = pickCoverUrlFromObservations(
      [
        imageObservation("cover_front", "https://example.test/a.jpg", "strong"),
        imageObservation("cover_front", "https://example.test/b.jpg", "strong"),
      ],
      (candidate) => (candidate.includes("/b.jpg") ? 2 : 1),
    );
    expect(url).toBe("https://example.test/b.jpg");
  });
});

describe("rankFactObservations", () => {
  it("classe structured_fact avant listing_fact", () => {
    const ranked = rankFactObservations([
      {
        kind: "fact",
        role: "listing_fact",
        factKind: "players",
        label: "Joueurs",
        value: "2-4",
        provenance: {
          providerId: "test",
          sourceDocumentRole: "marketplace_listing",
          evidenceSignals: ["barcode_match"],
        },
        usage: makeObservationUsage({ evidence: "weak" }),
      },
      {
        kind: "fact",
        role: "structured_fact",
        factKind: "players",
        label: "Joueurs",
        value: "3-4",
        provenance: {
          providerId: "test",
          sourceDocumentRole: "reference_record",
          evidenceSignals: ["structured_data"],
        },
        usage: makeObservationUsage({ evidence: "strong" }),
      },
    ]);
    expect(ranked[0]?.role).toBe("structured_fact");
  });
});

describe("pickBarcodeFieldValuesFromObservations", () => {
  it("reprojette platform et joueurs depuis les facts observationnels", () => {
    expect(
      pickBarcodeFieldValuesFromObservations([
        {
          kind: "fact",
          role: "structured_fact",
          factKind: "platform",
          label: "Plateforme",
          value: "wii",
          provenance: {
            providerId: "pricecharting",
            sourceDocumentRole: "reference_record",
            evidenceSignals: ["barcode_match"],
          },
          usage: makeObservationUsage({ evidence: "strong" }),
        },
        {
          kind: "fact",
          role: "listing_fact",
          factKind: "players",
          label: "Joueurs",
          value: "1-99",
          provenance: {
            providerId: "ebay",
            sourceDocumentRole: "marketplace_listing",
            evidenceSignals: ["barcode_match"],
          },
          usage: makeObservationUsage({ evidence: "weak" }),
        },
        {
          kind: "fact",
          role: "structured_fact",
          factKind: "players",
          label: "Joueurs",
          value: "2 à 4",
          provenance: {
            providerId: "philibert",
            sourceDocumentRole: "catalog_product",
            evidenceSignals: ["structured_data"],
          },
          usage: makeObservationUsage({ evidence: "strong" }),
        },
      ]),
    ).toEqual({
      platformKey: "wii",
      mediaFormat: null,
      players: "2 à 4",
      playtime: null,
      ageRating: null,
    });
  });
});

describe("titleObservationRankScore", () => {
  it("donne un score plus élevé aux titres catalogue qu'aux listing", () => {
    const catalog = titleObservation("catalog_title", "Catan", "normal", true);
    const listing = titleObservation("listing_title", "Catan boite", "weak", false);
    if (catalog.kind !== "title" || listing.kind !== "title") {
      throw new Error("expected title observations");
    }
    expect(titleObservationRankScore(catalog)).toBeGreaterThan(
      titleObservationRankScore(listing),
    );
  });
});
