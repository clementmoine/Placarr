import { describe, expect, it } from "vitest";

import {
  providerModuleForPack,
  providerModuleProviding,
  providerModulesForPack,
} from "./packOwner";

describe("providerModuleForPack — dual dataPack owners", () => {
  it("lists both Pokémon modules that share dataPack pokemon", () => {
    const owners = providerModulesForPack("pokemon");
    const ids = owners.map((m) => m.info.id).sort();
    expect(ids).toEqual(["pokemontcglive", "tcgdex"]);
  });

  it("resolves logos + checklist prints on the Live catalogue owner", () => {
    // First registry hit may still be tcgdex (harvest) — no resolveSetLogo.
    expect(providerModuleForPack("pokemon")?.info.id).toBe("tcgdex");
    expect(providerModuleForPack("pokemon")?.resolveSetLogo).toBeUndefined();

    const logos = providerModuleProviding("pokemon", "resolveSetLogo");
    expect(logos?.info.id).toBe("pokemontcglive");
    expect(typeof logos?.resolveSetLogo).toBe("function");

    const prints = providerModuleProviding("pokemon", "listSetPrints");
    expect(prints?.info.id).toBe("pokemontcglive");
  });
});
