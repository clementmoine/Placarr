import { describe, expect, it } from "vitest";

import { nameDatabaseProviderForType } from "@/services/provider/registry";

/**
 * Épingle la sélection du name-database par type depuis les traits déclarés
 * (`nameDatabase` + `canonical`), sans knob `weight`. Si un nouveau provider
 * déclare `nameDatabase` et change un gagnant, ce test force une décision
 * explicite plutôt qu'un basculement silencieux.
 */
describe("nameDatabaseProviderForType", () => {
  it.each([
    ["games", "igdb"],
    ["books", "openlibrary"],
    ["musics", "deezer"],
    ["movies", "tmdb"],
    ["boardgames", "boardgamegeek"],
  ])("%s → %s", (type, providerId) => {
    expect(nameDatabaseProviderForType(type)?.id).toBe(providerId);
  });

  it("renvoie undefined pour un type sans name database", () => {
    expect(nameDatabaseProviderForType("unknown-type")).toBeUndefined();
  });
});
