import { describe, expect, it } from "vitest";

import { resolveItemMetadataLookupQuery } from "./metadataLookupQuery";

describe("resolveItemMetadataLookupQuery", () => {
  it("prefers an explicit lookup query when provided", () => {
    expect(
      resolveItemMetadataLookupQuery({
        name: "Objet 0087169139499",
        barcode: "0087169139499",
        metadataTitle: "Black stories - Autour du monde",
        explicitQuery: "Autour du monde",
      }),
    ).toBe("Autour du monde");
  });

  it("uses the barcode for placeholder item names", () => {
    expect(
      resolveItemMetadataLookupQuery({
        name: "Objet 0087169139499",
        barcode: "0087169139499",
      }),
    ).toBe("0087169139499");
  });

  it("keeps metadata title for enriched items", () => {
    expect(
      resolveItemMetadataLookupQuery({
        name: "Black Stories - Musique D'enfer",
        barcode: "0087169139390",
        metadataTitle: "Black Stories - Musique D'enfer",
      }),
    ).toBe("Black Stories - Musique D'enfer");
  });
});
