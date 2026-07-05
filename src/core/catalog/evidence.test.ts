import { describe, expect, it } from "vitest";

import {
  isAnchorProvider,
  isCatalogTitleAnchorProvider,
  isTrustedRetailerProvider,
  sourceWeightForProvider,
} from "@/core/catalog/evidence";

describe("providerEvidence — trusted retailers", () => {
  it("reconnaît Philibert comme revendeur de confiance", () => {
    expect(isTrustedRetailerProvider("Philibert")).toBe(true);
    expect(isAnchorProvider("Philibert")).toBe(true);
  });

  it("reconnaît les boutiques PrestaShop comme revendeurs de confiance", () => {
    expect(isTrustedRetailerProvider("Ludifolie")).toBe(true);
    expect(isTrustedRetailerProvider("Monsieur de")).toBe(true);
  });

  it("reconnaît iCollect comme ancre de titre catalogue offline", () => {
    expect(isCatalogTitleAnchorProvider("iCollect Everything")).toBe(true);
    expect(isAnchorProvider("iCollect Everything")).toBe(true);
    expect(isCatalogTitleAnchorProvider("eBay")).toBe(false);
  });

  it("donne un poids intermédiaire aux revendeurs de confiance", () => {
    expect(sourceWeightForProvider("Philibert")).toBeGreaterThan(0.2);
    expect(sourceWeightForProvider("Philibert")).toBeLessThan(
      sourceWeightForProvider("BoardGameGeek"),
    );
    expect(sourceWeightForProvider("eBay")).toBeLessThan(
      sourceWeightForProvider("Philibert"),
    );
  });

  it("résout id et label d'affichage depuis un label evidence barcode", async () => {
    const { providerDisplayLabelForEvidenceLabel, providerIdForEvidenceLabel } =
      await import("@/core/catalog/evidence");
    expect(providerIdForEvidenceLabel("ScreenScraper")).toBe("screenscraper");
    expect(providerDisplayLabelForEvidenceLabel("ScreenScraper")).toBe(
      "ScreenScraper",
    );
    expect(providerIdForEvidenceLabel("UnknownShop")).toBe("UnknownShop");
  });
});
