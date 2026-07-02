import { describe, expect, it } from "vitest";

import {
  bookIdentifierLabel,
  itemsBarcodeLabelKey,
  scannerBarcodePlaceholderKey,
} from "./shelfLabels";

describe("barcodeShelfLabels", () => {
  it("utilise des libellés livres sur les étagères books", () => {
    expect(itemsBarcodeLabelKey("books")).toBe("items.barcodeBooks");
    expect(itemsBarcodeLabelKey("games")).toBe("items.barcode");
    expect(scannerBarcodePlaceholderKey("books")).toBe(
      "scanner.manualBarcodePlaceholderBooks",
    );
  });

  it("déduit le libellé d'identifiant éditorial", () => {
    expect(bookIdentifierLabel("9782803604562")).toBe("ISBN-13");
    expect(bookIdentifierLabel("2803604562")).toBe("ISBN-10");
    expect(bookIdentifierLabel("5021290082728")).toBe("EAN-13");
  });
});
