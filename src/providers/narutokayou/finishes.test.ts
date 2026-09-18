import { describe, expect, it } from "vitest";

import { kayouFinishesForRarity, kayouShinyFinish } from "./finishes";

describe("kayouFinishesForRarity", () => {
  it.each([
    [null, null],
    ["R", null],
    ["N", null],
    ["C", null],
    ["SR", "holo"],
    ["UR", "holo"],
    ["SP", "holo"],
    ["HR", "hr"],
    ["MR", "mr"],
    ["BP", "bp"],
  ] as const)("maps rarity %s → shiny %s", (rarity, shiny) => {
    expect(kayouShinyFinish(rarity)).toBe(shiny);
  });

  it("always keeps a plain finish option", () => {
    expect(kayouFinishesForRarity("SR")).toEqual(["normal", "holo"]);
    expect(kayouFinishesForRarity("HR")).toEqual(["normal", "hr", "holo"]);
    expect(kayouFinishesForRarity("BP")).toEqual(["normal", "bp", "holo"]);
    expect(kayouFinishesForRarity("R")).toEqual(["normal"]);
  });
});
