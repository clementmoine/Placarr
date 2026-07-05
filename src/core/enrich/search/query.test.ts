import { describe, expect, it } from "vitest";

import { cleanSearchQuery } from "@/core/enrich/search/query";

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

  it("strips legal mark symbols from provider search queries", () => {
    expect(cleanSearchQuery("You Suck at Parking® - Complete Edition")).toBe(
      "You Suck at Parking - Complete Edition",
    );
    expect(cleanSearchQuery("Parking™ Deluxe©")).toBe("Parking Deluxe");
  });
});
