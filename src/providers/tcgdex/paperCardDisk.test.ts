import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { localPokemonCatalogueArtUrl, pokemonCardFolderId } from "./paperCardDisk";

describe("pokemonCardFolderId", () => {
  it("pads numeric local ids to 3 digits", () => {
    expect(pokemonCardFolderId("4")).toBe("004");
    expect(pokemonCardFolderId("15")).toBe("015");
  });
});

describe("localPokemonCatalogueArtUrl", () => {
  it("serves coleka art for 2023sv when Live is absent", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "poke-local-art-"));
    const cardDir = path.join(root, "2023sv", "fr", "004");
    mkdirSync(cardDir, { recursive: true });
    writeFileSync(path.join(cardDir, "art.coleka.webp"), "x");

    expect(
      localPokemonCatalogueArtUrl("pokemon:2023sv-4", "fr", root),
    ).toBe("/assets/pokemon/cards/2023sv/fr/004/art.coleka.webp");
  });
});
