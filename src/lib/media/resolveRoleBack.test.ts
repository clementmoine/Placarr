import { describe, expect, it } from "vitest";

import { matchAssetsBacksRest, resolveRoleBack } from "./resolveRoleBack";

describe("matchAssetsBacksRest", () => {
  it("parses pack and set role backs", () => {
    expect(matchAssetsBacksRest(["backs", "fr"])).toEqual({ lang: "fr" });
    expect(matchAssetsBacksRest(["backs", "en", "sets", "s1"])).toEqual({
      lang: "en",
      set: "s1",
    });
    expect(matchAssetsBacksRest(["backs", "en", "tiers", "holo"])).toEqual({
      lang: "en",
      tier: "holo",
    });
  });

  it("rejects junk", () => {
    expect(matchAssetsBacksRest(["cards", "back.webp"])).toBeNull();
    expect(matchAssetsBacksRest(["backs", "../x"])).toBeNull();
  });
});

describe("resolveRoleBack", () => {
  it("resolves Naruto FR pack sleeve when installed", () => {
    const hit = resolveRoleBack("naruto/carddass", { lang: "fr" });
    if (!hit) return; // CI without data/
    expect(hit.kind).toBe("pack");
    expect(hit.filePath).toMatch(/back\.fr\.webp$/i);
  });
});
