import { describe, expect, it } from "vitest";

import { isRetailerCoverUrlAlignedWithTitle } from "./coverUrlMatch";

describe("isRetailerCoverUrlAlignedWithTitle", () => {
  it("accepts a cover filename that matches the catalog title", () => {
    expect(
      isRetailerCoverUrlAlignedWithTitle(
        "https://cdn.example.com/photoProd/zoom/outer-wilds-archaeologist-edition.jpg",
        "Outer Wilds Archaeologist Edition PS5",
      ),
    ).toBe(true);
  });

  it("rejects a cover filename for a different game", () => {
    expect(
      isRetailerCoverUrlAlignedWithTitle(
        "https://www.achatmoinscher.com/photoProd/zoom/2309/the-walking-dead-saints-and-sinners-chapter-2-retribution-payback-edit-203847518.jpg",
        "Outer Wilds Archaeologist Edition PS5 (Playstation 5)",
      ),
    ).toBe(false);
  });

  it("rejects AchatMoinsCher marketplace logo assets", () => {
    expect(
      isRetailerCoverUrlAlignedWithTitle(
        "https://www.achatmoinscher.com/img/M6.png",
        "Outer Wilds Archaeologist Edition PS5",
      ),
    ).toBe(false);
  });
});
