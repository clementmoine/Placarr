import { describe, expect, it } from "vitest";

import {
  collectMetadataTitleSuggestions,
  resolveBestMetadataTitleSuggestion,
} from "./titleSuggestions";

describe("collectMetadataTitleSuggestions", () => {
  it("returns catalog aliases without requiring a barcode lookup", () => {
    expect(
      collectMetadataTitleSuggestions(
        {
          title: "0087169139499",
          aliases: ["Black stories - Autour du monde"],
        },
        { itemName: "0087169139499", barcode: "0087169139499" },
      ),
    ).toEqual(["Black stories - Autour du monde"]);
  });

  it("keeps the current editorial name in the suggestion list", () => {
    expect(
      collectMetadataTitleSuggestions(
        {
          title: "Black Stories : Morts de Rire",
          aliases: ["Black Stories - Morts de Rire"],
        },
        { itemName: "Mon jeu préféré", barcode: "0626570614616" },
      ),
    ).toEqual([
      "Black Stories : Morts de Rire",
      "Black Stories - Morts de Rire",
      "Mon jeu préféré",
    ]);
  });
});

describe("resolveBestMetadataTitleSuggestion", () => {
  it("picks the best catalog title for placeholder item names", () => {
    expect(
      resolveBestMetadataTitleSuggestion(
        {
          title: "0087169139499",
          aliases: ["Black stories - Autour du monde"],
        },
        { itemName: "Objet 0087169139499", barcode: "0087169139499" },
      ),
    ).toBe("Black stories - Autour du monde");
  });
});
