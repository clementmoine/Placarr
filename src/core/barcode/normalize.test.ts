import { describe, expect, it } from "vitest";

import {
  normalizeProductBarcode,
  pickDiscoveredBarcode,
  barcodesEquivalent,
  barcodeMatchKey,
} from "@/core/barcode/normalize";
import { parsePriceChartingBarcode } from "@/core/barcode/lookup/priceChartingParse";

describe("barcodesEquivalent", () => {
  it("treats EAN variants with leading zeros as the same product", () => {
    expect(barcodesEquivalent("0827912079678", "827912079678")).toBe(true);
    expect(barcodesEquivalent("0827912079678", "087169139338")).toBe(false);
  });

  it("normalizes via barcodeMatchKey for comparison", () => {
    expect(barcodeMatchKey("0827912079678")).toBe("827912079678");
    expect(barcodeMatchKey("000827912079678")).toBe("827912079678");
  });
});

describe("normalizeProductBarcode", () => {
  it("normalise les codes produits valides", () => {
    expect(normalizeProductBarcode("978-0-14-032872-1")).toBe("9780140328721");
    expect(normalizeProductBarcode("0045496365226")).toBe("0045496365226");
  });

  it("rejette les valeurs trop courtes ou trop longues", () => {
    expect(normalizeProductBarcode("123")).toBeNull();
    expect(normalizeProductBarcode("")).toBeNull();
  });
});

describe("pickDiscoveredBarcode", () => {
  it("prefere un EAN-13 quand plusieurs codes existent", () => {
    expect(pickDiscoveredBarcode(["45496365226", "9780140328721", null])).toBe(
      "9780140328721",
    );
  });
});

describe("parsePriceChartingBarcode", () => {
  it("extrait le premier code valide depuis la fiche produit", () => {
    const html = `
      <td class="title">EAN / GTIN:</td>
      <td class="details">045496363956,045496363949</td>
    `;

    expect(parsePriceChartingBarcode(html)).toBe("045496363956");
  });
});
