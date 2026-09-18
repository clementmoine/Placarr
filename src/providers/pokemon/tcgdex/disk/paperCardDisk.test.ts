import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildPokemonDiskArtAttachments,
  localPokemonCatalogueArtUrl,
  pokemonCardFolderId,
} from "./paperCardDisk";
import { recordPokemonFaceDecision } from "./faceChoice";

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

describe("buildPokemonDiskArtAttachments", () => {
  it("emits one catalog cover per art.* and defaults to face.json winner", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "poke-multi-art-"));
    const cardDir = path.join(root, "2023sv", "fr", "004");
    mkdirSync(cardDir, { recursive: true });
    writeFileSync(path.join(cardDir, "art.webp"), "live");
    writeFileSync(path.join(cardDir, "art.mcdn.png"), "mcdn");
    writeFileSync(path.join(cardDir, "art.coleka.webp"), "coleka");
    recordPokemonFaceDecision(cardDir, "art", "art.mcdn.png");

    const { attachments, defaultUrl } = buildPokemonDiskArtAttachments({
      printKey: "pokemon:2023sv-4",
      language: "fr",
      source: "tcgdex",
      title: "Bulbizarre",
      cardsRoot: root,
    });

    expect(attachments).toHaveLength(3);
    expect(attachments.every((a) => a.coverProvenance === "catalog")).toBe(
      true,
    );
    expect(attachments.every((a) => a.source === "tcgdex")).toBe(true);
    expect(defaultUrl).toBe(
      "/assets/pokemon/cards/2023sv/fr/004/art.mcdn.png",
    );
    expect(attachments[0]?.url).toBe(defaultUrl);
    expect(
      attachments.map((a) => a.role).sort(),
    ).toEqual(
      ["pokemon-face-coleka", "pokemon-face-live", "pokemon-face-mcdn"].sort(),
    );
  });
});
