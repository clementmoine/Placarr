import { describe, expect, it } from "vitest";

import { cardBackUrlFor } from "./cardBack";

describe("cardBackUrlFor", () => {
  it("finds the back for a game that ships one", () => {
    expect(cardBackUrlFor("lorcana:1-17")).toBe("/cardbacks/lorcana.webp");
    expect(cardBackUrlFor("lorcana:13-245-p1")).toBe("/cardbacks/lorcana.webp");
  });

  it("gives nothing for a game with no back", () => {
    // No flip is better than a flip onto a placeholder that says nothing.
    expect(cardBackUrlFor("pokemon:sv1-25")).toBeNull();
  });

  it("gives nothing for something that is not a print key at all", () => {
    // Every other shelf type goes through here too — a board game must not
    // pick up a card back because its identifier happened to parse.
    expect(cardBackUrlFor(null)).toBeNull();
    expect(cardBackUrlFor(undefined)).toBeNull();
    expect(cardBackUrlFor("")).toBeNull();
    expect(cardBackUrlFor("9782205057003")).toBeNull();
  });

  it("names only files that ship with the app", () => {
    // A path typo is invisible until a card is flipped onto nothing.
    expect(cardBackUrlFor("lorcana:1-1")).toMatch(
      /^\/cardbacks\/[a-z0-9]+\.(webp|png|jpg)$/,
    );
  });
});
