import { describe, expect, it } from "vitest";

import { buildProductEvidence } from "./parse";
import {
  barcodeEvidenceObservationSourceWeight,
  pickPlatformKeyFromEvidence,
} from "./observations";
import { pickRepresentativeEvidence } from "./resolve";

describe("pickRepresentativeEvidence — observation rank", () => {
  it("prefers a trusted retailer catalog title over a heavy marketplace listing", () => {
    const trusted = buildProductEvidence("Philibert", {
      name: "Catan",
      coverUrl: "https://example.test/catan.jpg",
    });
    const marketplace = buildProductEvidence("PicClick", {
      name: "Catan - Complet Boite Notice",
      coverUrl: null,
    });
    expect(trusted).not.toBeNull();
    expect(marketplace).not.toBeNull();
    if (!trusted || !marketplace) return;

    marketplace.sourceWeight = 0.99;
    trusted.sourceWeight = 0.1;

    expect(
      pickRepresentativeEvidence([marketplace, trusted]).providerName,
    ).toBe("Philibert");
  });
});

describe("barcodeEvidenceObservationSourceWeight", () => {
  it("maps catalog observations above listing observations", () => {
    const trusted = buildProductEvidence("Philibert", { name: "Catan" });
    const listing = buildProductEvidence("PicClick", {
      name: "Catan - Complet",
    });
    expect(trusted).not.toBeNull();
    expect(listing).not.toBeNull();
    if (!trusted || !listing) return;

    expect(
      barcodeEvidenceObservationSourceWeight(trusted),
    ).toBeGreaterThan(barcodeEvidenceObservationSourceWeight(listing));
  });

  it("keeps provider sourceWeight when observation role matches evidence tier", () => {
    const listing = buildProductEvidence("PicClick", { name: "Catan" });
    expect(listing).not.toBeNull();
    if (!listing) return;

    expect(barcodeEvidenceObservationSourceWeight(listing)).toBe(
      listing.sourceWeight,
    );
  });
});

describe("pickPlatformKeyFromEvidence — fact observations", () => {
  it("reads platform from structured facts when title parsing missed it", () => {
    const evidence = buildProductEvidence("PriceCharting", {
      name: "Mario Kart Wii",
      coverUrl: null,
      facts: [{ kind: "platform", label: "Plateforme", value: "wii" }],
    });
    expect(evidence).not.toBeNull();
    if (!evidence) return;

    evidence.parsed = { ...evidence.parsed, platformKey: undefined };

    expect(pickPlatformKeyFromEvidence([evidence])).toBe("wii");
  });
});
