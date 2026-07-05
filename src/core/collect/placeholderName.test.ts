import { describe, expect, it } from "vitest";

import {
  isBarcodePlaceholderItemName,
  buildBarcodePlaceholderItemName,
} from "./placeholderName";

describe("buildBarcodePlaceholderItemName", () => {
  it("builds a French bulk-scan placeholder", () => {
    expect(buildBarcodePlaceholderItemName("0087169139499")).toBe(
      "Objet 0087169139499",
    );
  });
});

describe("isBarcodePlaceholderItemName", () => {
  it("detects bulk-scan French placeholder names", () => {
    expect(
      isBarcodePlaceholderItemName("Objet 0087169139499", "0087169139499"),
    ).toBe(true);
  });

  it("detects raw barcode-only names", () => {
    expect(isBarcodePlaceholderItemName("0087169139499", "0087169139499")).toBe(
      true,
    );
  });

  it("detects bulk-scan English placeholder names", () => {
    expect(
      isBarcodePlaceholderItemName("Item 3421272109517", "3421272109517"),
    ).toBe(true);
  });

  it("rejects placeholder prefix when barcode differs", () => {
    expect(
      isBarcodePlaceholderItemName("Objet 0087169139499", "3421272109517"),
    ).toBe(false);
  });

  it("rejects real titles", () => {
    expect(
      isBarcodePlaceholderItemName(
        "Black Stories Autour du Monde",
        "0087169139499",
      ),
    ).toBe(false);
  });
});
