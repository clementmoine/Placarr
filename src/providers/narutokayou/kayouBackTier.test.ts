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

  it("maps SSR/PTR onto the shared SR sleeve via aliases", () => {
    expect(kayouBackTierSlug("SSR")).toBe("ssr");
    expect(kayouCardBackUrlForRarity("naruto/kayou", "SSR")).toBe(
      "/assets/naruto/kayou/cards/back.sr.webp",
    );
    expect(kayouCardBackUrlForRarity("naruto/kayou", "PTR")).toBe(
      "/assets/naruto/kayou/cards/back.sr.webp",
    );
  });

  it("does not stamp R when it matches the pack default", () => {
    expect(kayouCardBackUrlForRarity("naruto/kayou", "R")).toBeNull();
  });

  it("returns null when rarity is empty", () => {
    expect(kayouCardBackUrlForRarity("naruto/kayou", "")).toBeNull();
  });
});
