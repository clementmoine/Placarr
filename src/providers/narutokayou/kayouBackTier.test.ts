import { describe, expect, it } from "vitest";

import { kayouBackTierSlug, kayouCardBackUrlForRarity } from "./kayouBackTier";

describe("kayouBackTierSlug", () => {
  it.each([
    ["R", "r"],
    ["UR", "ur"],
    ["SSR", "ssr"],
    ["HR", "hr"],
    ["MR", "mr"],
    ["BP", "bp"],
    ["◇XR", "shin-xr"],
    ["SHIN-XR", "shin-xr"],
    ["◇MR", "shin-mr"],
    ["", null],
    [null, null],
  ] as const)("maps %j → %j", (rarity, slug) => {
    expect(kayouBackTierSlug(rarity)).toBe(slug);
  });
});

describe("kayouCardBackUrlForRarity", () => {
  it("builds tier back asset URL", () => {
    expect(kayouCardBackUrlForRarity("naruto/kayou", "UR")).toBe(
      "/assets/naruto/kayou/cards/back.ur.webp",
    );
  });

  it("returns null when rarity is empty", () => {
    expect(kayouCardBackUrlForRarity("naruto/kayou", "")).toBeNull();
  });
});
