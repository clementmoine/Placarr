import { describe, expect, it } from "vitest";

import { cleanSearchQuery } from "./metadataSearchUtils";

describe("cleanSearchQuery", () => {
  it("keeps New in franchise titles like New Super Mario Bros.", () => {
    expect(cleanSearchQuery("New Super Mario Bros. Wii")).toBe(
      "New Super Mario Bros.",
    );
  });

  it("still strips trailing condition markers", () => {
    expect(cleanSearchQuery("Mario Kart Wii neuf")).toBe("Mario Kart");
    expect(cleanSearchQuery("Zelda Breath of the Wild NEW")).toBe(
      "Zelda Breath of the Wild",
    );
  });

  it("keeps French prepositions in titles", () => {
    expect(cleanSearchQuery("Club Football 2005 Olympique de Marseille")).toBe(
      "Club Football 2005 Olympique de Marseille",
    );
  });
});
