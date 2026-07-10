import { describe, expect, it } from "vitest";

import { discoveredBarcodeMatchesRequestedPlatform } from "./discoveredBarcode";

describe("discoveredBarcodeMatchesRequestedPlatform", () => {
  it("accepts a barcode when the provider platform matches the shelf", () => {
    expect(
      discoveredBarcodeMatchesRequestedPlatform(
        { platformKey: "psvita" },
        "psvita",
      ),
    ).toBe(true);
  });

  it("rejects a barcode confirmed on another console", () => {
    expect(
      discoveredBarcodeMatchesRequestedPlatform(
        { platformKey: "ps4" },
        "psvita",
      ),
    ).toBe(false);
  });

  it("rejects unknown-platform barcodes on a platform shelf", () => {
    expect(
      discoveredBarcodeMatchesRequestedPlatform({ platformKey: undefined }, "psvita"),
    ).toBe(false);
  });

  it("allows unknown-platform barcodes on a generic shelf", () => {
    expect(
      discoveredBarcodeMatchesRequestedPlatform({ platformKey: undefined }, null),
    ).toBe(true);
  });
});
