import { describe, expect, it } from "vitest";

import {
  collectBarcodesFromLedgerRow,
  gs1CheckDigitValid,
  isIssnShapedBarcode,
  mergeSealedBarcodes,
  normalizeSealedBarcode,
  sealedBarcodeIndexKey,
} from "./barcodes";

describe("normalizeSealedBarcode", () => {
  it("normalizes a valid EAN-13", () => {
    expect(normalizeSealedBarcode("3296-5800-5211-0")).toBe("3296580052110");
    expect(gs1CheckDigitValid("3296580052110")).toBe(true);
  });

  it("normalizes a valid UPC-A", () => {
    expect(normalizeSealedBarcode("045557239770")).toBe("045557239770");
  });

  it("rejects a bad check digit", () => {
    expect(normalizeSealedBarcode("3296580052111")).toBeNull();
  });

  it("rejects ISSN-shaped 977 GTINs (CardGameClub junk)", () => {
    expect(isIssnShapedBarcode("9771129462918")).toBe(true);
    expect(normalizeSealedBarcode("9771129462918")).toBeNull();
    expect(normalizeSealedBarcode("9771129462017")).toBeNull();
    expect(normalizeSealedBarcode("9771828100067")).toBeNull();
  });

  it("rejects empty / non-GTIN lengths", () => {
    expect(normalizeSealedBarcode("")).toBeNull();
    expect(normalizeSealedBarcode("123")).toBeNull();
    expect(normalizeSealedBarcode("12345678901")).toBeNull();
  });

  it("accepts Bandai JAN padded with trailing 000 (16 digits → EAN-13)", () => {
    expect(normalizeSealedBarcode("4570118213631000")).toBe("4570118213631");
    expect(normalizeSealedBarcode("4570118213631")).toBe("4570118213631");
  });
});

describe("mergeSealedBarcodes", () => {
  it("dedupes via match key and prefers EAN-13 over padded GTIN-14", () => {
    expect(
      mergeSealedBarcodes(
        ["03296580052110", "junk"],
        ["3296580052110", "03296580052110"],
      ),
    ).toEqual(["3296580052110"]);
  });

  it("drops ISSN-shaped and bad check digits", () => {
    expect(
      mergeSealedBarcodes([], ["9771129462918", "3296580052111", "3296580052110"]),
    ).toEqual(["3296580052110"]);
  });
});

describe("collectBarcodesFromLedgerRow", () => {
  it("reads ean/upc/jan/gtin/barcode fields", () => {
    expect(
      collectBarcodesFromLedgerRow({
        ean: "3296580051137",
        upc: "045557239770",
        jan: "9771129462918",
        note: "ignore",
      }),
    ).toEqual(["3296580051137", "045557239770"]);
  });

  it("accepts barcode arrays on dig rows", () => {
    expect(
      collectBarcodesFromLedgerRow({
        barcode: ["3296580052110", "not-a-code"],
      }),
    ).toEqual(["3296580052110"]);
  });
});

describe("sealedBarcodeIndexKey", () => {
  it("strips leading zeros for index storage", () => {
    expect(sealedBarcodeIndexKey("03296580052110")).toBe("3296580052110");
    expect(sealedBarcodeIndexKey("045557239770")).toBe("45557239770");
  });
});
