import { describe, expect, it } from "vitest";

import {
  cardBackRgbaFromDataDir,
  isCardBackName,
} from "./cardBack";

describe("cardBack names", () => {
  it.each(["cardBack", "card_back", "CARDBACK"])(
    "recognizes %s",
    (name) => {
      expect(isCardBackName(name)).toBe(true);
    },
  );

  it("rejects unrelated texture names", () => {
    expect(isCardBackName("Card")).toBe(false);
  });
});

describe("cardBackRgbaFromDataDir", () => {
  it("returns null when the hashed asset is absent", async () => {
    await expect(cardBackRgbaFromDataDir("/tmp/does-not-exist-placarr", null)).resolves.toBeNull();
  });
});
