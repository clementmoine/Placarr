import { describe, expect, it } from "vitest";

import {
  refineCatalogDisplayTitle,
  resolveMetadataDisplayTitle,
  shouldRefineCatalogDisplayTitle,
} from "./refineCatalogDisplayTitle";

describe("refineCatalogDisplayTitle", () => {
  it("detects raw barcode titles as placeholders", () => {
    expect(
      shouldRefineCatalogDisplayTitle("0087169139499", "0087169139499"),
    ).toBe(true);
  });

  it("picks a catalog alias when the preliminary title is the barcode", () => {
    expect(
      refineCatalogDisplayTitle(
        "0087169139499",
        ["0087169139499", "Black stories - Autour du monde"],
        "0087169139499",
      ),
    ).toBe("Black stories - Autour du monde");
  });

  it("leaves editorial titles untouched", () => {
    expect(
      refineCatalogDisplayTitle(
        "Mille Sabords - Complet Boite Notice",
        ["Mille Sabords", "Mille Sabords - Complet Boite Notice"],
        "3421272109517",
      ),
    ).toBe("Mille Sabords - Complet Boite Notice");
  });
});

describe("resolveMetadataDisplayTitle", () => {
  it("resolves a display title from aliases when metadata title is still the barcode", () => {
    expect(
      resolveMetadataDisplayTitle(
        {
          title: "0087169139499",
          aliases: ["Black stories - Autour du monde"],
        },
        "0087169139499",
      ),
    ).toBe("Black stories - Autour du monde");
  });
});
