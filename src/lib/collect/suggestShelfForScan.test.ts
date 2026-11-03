import { describe, expect, it } from "vitest";

import { suggestShelfForScan } from "@/lib/collect/suggestShelfForScan";

const narutoShelves = [
  { id: "carddass", name: "Naruto Carddass", type: "tcg" },
  { id: "ranks", name: "Naruto Ninja Ranks", type: "tcg" },
  { id: "ultra", name: "Naruto Ultra Challenge", type: "tcg" },
  { id: "mythos", name: "Naruto Mythos", type: "tcg" },
  { id: "games", name: "Switch", type: "games" },
] as const;

describe("suggestShelfForScan", () => {
  it("picks Ninja Ranks from a specific catalogue label", () => {
    expect(
      suggestShelfForScan({
        shelves: narutoShelves,
        itemType: "tcg",
        catalogueLabels: ["Naruto Ninja Ranks", "Ninja Ranks"],
      }),
    ).toEqual({ shelfId: "ranks", confidence: "sure" });
  });

  it("stays empty when only the franchise word is available (Naruto ambiguity)", () => {
    expect(
      suggestShelfForScan({
        shelves: narutoShelves,
        itemType: "tcg",
        catalogueLabels: ["Naruto"],
      }),
    ).toEqual({ shelfId: null, confidence: "none" });
  });

  it("auto-applies a barcode guess when the shelf is still typed-compatible", () => {
    expect(
      suggestShelfForScan({
        shelves: narutoShelves,
        itemType: "tcg",
        barcodeGuessShelfId: "carddass",
        catalogueLabels: ["Naruto"],
      }),
    ).toEqual({ shelfId: "carddass", confidence: "sure" });
  });

  it("prefers the shelf from pathname over a weak catalogue hint", () => {
    expect(
      suggestShelfForScan({
        shelves: narutoShelves,
        itemType: "tcg",
        pathname: "/shelves/ultra",
        catalogueLabels: ["Naruto"],
      }),
    ).toEqual({ shelfId: "ultra", confidence: "sure" });
  });

  it("filters out incompatible types before scoring", () => {
    expect(
      suggestShelfForScan({
        shelves: narutoShelves,
        itemType: "games",
        preferredShelfId: "ranks",
        catalogueLabels: ["Naruto Ninja Ranks"],
      }),
    ).toEqual({ shelfId: "games", confidence: "weak" });
  });
});
