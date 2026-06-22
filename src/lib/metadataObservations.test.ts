import { describe, expect, it } from "vitest";

import {
  isDisplayObservation,
  isRejectedObservation,
  isSearchableObservation,
  makeObservationUsage,
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationEvidenceRank,
  observationKind,
  observationsFromMetadataResult,
  shouldRetainObservation,
} from "@/lib/metadataObservations";
import type { MetadataObservation } from "@/types/metadataObservation";

const baseProvenance = {
  providerId: "provider-a",
  providerLabel: "Provider A",
  sourceDocumentRole: "catalog_product",
  sourceUrl: "https://example.test/product",
  evidenceSignals: ["structured_data", "barcode_match"],
} satisfies MetadataObservation["provenance"];

describe("metadata observation contract", () => {
  it("accepts typed observations for every supported kind", () => {
    const observations = [
      {
        kind: "title",
        role: "catalog_title",
        value: "Mille Sabords",
        language: "fr",
        provenance: baseProvenance,
        usage: makeObservationUsage({
          displayCandidate: true,
          searchAlias: "strong",
          evidence: "strong",
        }),
      },
      {
        kind: "image",
        role: "cover_front",
        type: "cover",
        url: "https://example.test/cover.jpg",
        provenance: baseProvenance,
        usage: makeObservationUsage({
          displayCandidate: true,
          evidence: "strong",
        }),
      },
      {
        kind: "fact",
        role: "structured_fact",
        factKind: "players",
        label: "Players",
        value: "2-5",
        provenance: baseProvenance,
        usage: makeObservationUsage({ evidence: "strong" }),
      },
      {
        kind: "alias",
        role: "provider_grouped_alias",
        value: "Mille Sabords !",
        language: "fr",
        provenance: baseProvenance,
        usage: makeObservationUsage({
          searchAlias: "normal",
          evidence: "normal",
        }),
      },
      {
        kind: "offer",
        role: "marketplace_offer",
        condition: "used",
        priceCents: 1200,
        currency: "EUR",
        provenance: {
          ...baseProvenance,
          sourceDocumentRole: "marketplace_listing",
        },
        usage: makeObservationUsage({ evidence: "weak" }),
      },
      {
        kind: "external-id",
        role: "provider_record_id",
        idKind: "bgg",
        value: "1234",
        provenance: baseProvenance,
        usage: makeObservationUsage({ evidence: "strong" }),
      },
    ] satisfies MetadataObservation[];

    expect(observations.map(observationKind)).toEqual([
      "title",
      "image",
      "fact",
      "alias",
      "offer",
      "external-id",
    ]);
    expect(METADATA_OBSERVATION_SCHEMA_VERSION).toBe(
      "metadata-observations/v1",
    );
  });

  it("keeps noisy listing observations without making them strong display data", () => {
    const listingTitle = {
      kind: "title",
      role: "listing_title",
      value: "Mille Sabords Gigamic neuf sous blister",
      provenance: {
        providerId: "marketplace-a",
        sourceDocumentRole: "marketplace_listing",
        evidenceSignals: ["same_provider_listing"],
      },
      usage: makeObservationUsage({
        displayCandidate: false,
        searchAlias: "weak",
        evidence: "weak",
      }),
    } satisfies MetadataObservation;

    expect(shouldRetainObservation(listingTitle)).toBe(true);
    expect(isDisplayObservation(listingTitle)).toBe(false);
    expect(isSearchableObservation(listingTitle)).toBe(true);
    expect(observationEvidenceRank(listingTitle.usage.evidence)).toBe(1);
  });

  it("models explicit mismatches as retained rejection evidence", () => {
    const mismatch = {
      kind: "external-id",
      role: "barcode",
      idKind: "ean13",
      value: "0000000000000",
      provenance: {
        providerId: "provider-a",
        sourceDocumentRole: "catalog_product",
        evidenceSignals: ["explicit_mismatch"],
      },
      usage: makeObservationUsage({
        evidence: "reject",
        searchAlias: "none",
        displayCandidate: false,
      }),
    } satisfies MetadataObservation;

    expect(isRejectedObservation(mismatch)).toBe(true);
    expect(shouldRetainObservation(mismatch)).toBe(true);
    expect(observationEvidenceRank(mismatch.usage.evidence)).toBe(-1);
  });

  it("bridges legacy MetadataResult values into typed observations", () => {
    const observations = observationsFromMetadataResult(
      {
        title: "Mille Sabords",
        imageUrl: "https://example.test/cover.jpg",
        aliases: ["Mille Sabords !"],
        regionalTitles: [{ region: "fr", text: "Mille Sabords FR" }],
        attachments: [
          {
            type: "image",
            url: "https://example.test/listing-photo.jpg",
            source: "provider-a",
            role: "fr",
          },
        ],
        facts: [
          {
            kind: "players",
            label: "Players",
            value: "2-5",
            source: "provider-a",
          },
        ],
        externalIds: { bgg: "1234" },
      },
      {
        providerId: "provider-a",
        providerLabel: "Provider A",
        sourceDocumentRole: "catalog_product",
        evidenceSignals: ["structured_data", "barcode_match"],
        titleRole: "catalog_title",
        aliasRole: "provider_grouped_alias",
        imageRole: "cover_front",
        factRole: "structured_fact",
        language: "fr",
      },
    );

    expect(observations.map(observationKind)).toEqual([
      "title",
      "title",
      "alias",
      "image",
      "image",
      "fact",
      "external-id",
    ]);
    expect(observations[0]).toMatchObject({
      kind: "title",
      role: "catalog_title",
      usage: { displayCandidate: true, searchAlias: "strong" },
    });
    expect(observations.find((item) => item.kind === "external-id")).toMatchObject(
      {
        kind: "external-id",
        idKind: "bgg",
        value: "1234",
      },
    );
    expect(observations.every(shouldRetainObservation)).toBe(true);
  });
});
