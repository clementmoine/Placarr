import { describe, expect, it } from "vitest";

import {
  includesFolded,
  normalizeForTokens,
  repairCatalogColonSubstitute,
} from "./normalize";

describe("normalizeForTokens", () => {
  it("strips diacritics and lowercases", () => {
    expect(normalizeForTokens("Été Café")).toBe("ete cafe");
    expect(normalizeForTokens("Pokémon")).toBe("pokemon");
  });

  it("preserves digits and latin letters otherwise", () => {
    expect(normalizeForTokens("Borderlands 3")).toBe("borderlands 3");
  });
});

describe("includesFolded", () => {
  it("matches accent-stripped queries against accented titles", () => {
    expect(includesFolded("7 Épées", "7 epees")).toBe(true);
    expect(includesFolded("Kidōmaru", "kidomaru")).toBe(true);
    expect(includesFolded("7 Épées", "7 sabres")).toBe(false);
  });
});

describe("repairCatalogColonSubstitute", () => {
  it("rewrites ScreenScraper-style Main ? Subtitle to a colon", () => {
    expect(
      repairCatalogColonSubstitute("Lego La Grande Aventure ? Le Jeu Vidéo"),
    ).toBe("Lego La Grande Aventure : Le Jeu Vidéo");
  });

  it("keeps trailing interrogative titles", () => {
    expect(repairCatalogColonSubstitute("Where is Carmen Sandiego?")).toBe(
      "Where is Carmen Sandiego?",
    );
  });

  it("leaves titles without an interior spaced ? unchanged", () => {
    expect(repairCatalogColonSubstitute("What Is Love? Baby")).toBe(
      "What Is Love? Baby",
    );
  });
});
