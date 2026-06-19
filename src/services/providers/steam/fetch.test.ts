import { describe, expect, it } from "vitest";

import { buildGameReferenceFacts } from "./fetch";

describe("buildGameReferenceFacts", () => {
  it("renvoie les liens PCGamingWiki et SteamDB encodés", () => {
    const facts = buildGameReferenceFacts("Hades II");
    expect(facts).toHaveLength(2);
    expect(facts[0]?.url).toBe(
      "https://www.pcgamingwiki.com/w/index.php?search=Hades%20II",
    );
    expect(facts[1]?.url).toBe(
      "https://steamdb.info/search/?a=app&q=Hades%20II",
    );
  });

  it("renvoie une liste vide sans titre", () => {
    expect(buildGameReferenceFacts("   ")).toEqual([]);
  });
});
