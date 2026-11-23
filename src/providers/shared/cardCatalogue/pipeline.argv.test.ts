import { describe, expect, it } from "vitest";

import { catalogueRefreshArgv } from "./pipeline";

describe("catalogueRefreshArgv — catalogue languages", () => {
  it("passes the pack's declared catalogue languages when the job names none", () => {
    // 2026-11-23 : la Sync Pokémon ne moissonnait que `fr` (défaut du CLI)
    // alors que l'Extract admin passait `en,fr` — les bundles EN disparaissaient.
    expect(catalogueRefreshArgv({}, { defaultLangs: ["en", "fr"] })).toEqual([
      "--langs",
      "en,fr",
    ]);
  });

  it("lets the job's own langs win", () => {
    expect(
      catalogueRefreshArgv({ langs: ["fr"] }, { defaultLangs: ["en", "fr"] }),
    ).toEqual(["--langs", "fr"]);
  });

  it("adds nothing for a pack that declares no languages", () => {
    expect(catalogueRefreshArgv({}, {})).toEqual([]);
  });
});
