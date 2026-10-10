import { describe, expect, it } from "vitest";

import {
  bookIdentifierLabel,
  itemsAddLabelKey,
  itemsCountNounKey,
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

describe("itemsAddLabelKey", () => {
  it("adapte le CTA d'ajout au type d'étagère", () => {
    expect(itemsAddLabelKey("tcg")).toBe("items.addItemTcg");
    expect(itemsAddLabelKey("games")).toBe("items.addItemGame");
    expect(itemsAddLabelKey("boardgames")).toBe("items.addItemGame");
    expect(itemsAddLabelKey("books")).toBe("items.addItemBook");
    expect(itemsAddLabelKey("movies")).toBe("items.addItemMovie");
    expect(itemsAddLabelKey(null)).toBe("items.addItem");
  });
});

describe("itemsCountNounKey", () => {
  it("choisit le nom comptable selon le type et le nombre", () => {
    expect(itemsCountNounKey("tcg", 1)).toBe("items.countNounTcg");
    expect(itemsCountNounKey("tcg", 12)).toBe("items.countNounTcgPlural");
    expect(itemsCountNounKey("tcg", 0)).toBe("items.countNounTcgPlural");
    expect(itemsCountNounKey("games", 1)).toBe("items.countNounGame");
    expect(itemsCountNounKey("boardgames", 3)).toBe(
      "items.countNounGamePlural",
    );
    expect(itemsCountNounKey(undefined, 1)).toBe("common.item");
    expect(itemsCountNounKey("unknown", 2)).toBe("common.items");
  });
});
