import { describe, expect, it } from "vitest";

import {
  limitlessPocketFaceUrl,
  limitlessPocketSetCodeFromImageBase,
} from "./fillPocketFaces";

describe("limitlessPocketFaceUrl", () => {
  it("pads collector numbers for Pocket CDN paths", () => {
    expect(limitlessPocketFaceUrl("B2a", "1")).toBe(
      "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/pocket/B2a/B2a_001_EN.webp",
    );
    expect(limitlessPocketFaceUrl("b2a", "131", "EN")).toBe(
      "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/pocket/b2a/b2a_131_EN.webp",
    );
  });
});

describe("limitlessPocketSetCodeFromImageBase", () => {
  it("keeps TCGdex Pocket casing for Limitless CDN", () => {
    expect(
      limitlessPocketSetCodeFromImageBase(
        "https://assets.tcgdex.net/en/tcgp/A3b/001",
        "a3b",
      ),
    ).toBe("A3b");
    expect(
      limitlessPocketSetCodeFromImageBase(
        "https://assets.tcgdex.net/fr/tcgp/B1/014",
      ),
    ).toBe("B1");
  });

  it("falls back to set id when CDN base is absent", () => {
    expect(limitlessPocketSetCodeFromImageBase(null, "b2a")).toBe("b2a");
    expect(limitlessPocketSetCodeFromImageBase("")).toBe("");
  });
});
