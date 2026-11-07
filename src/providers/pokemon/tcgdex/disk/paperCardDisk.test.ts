import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildPokemonDiskArtAttachments,
  localPokemonCatalogueArtUrl,
  pokemonCardFolderId,
  resolvePokemonCatalogueArtFilename,
} from "./paperCardDisk";
import { recordPokemonFaceDecision } from "./faceChoice";

/** Minimal 1×1 PNG — face ranking probes dims and rejects empty stubs. */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function writeFace(dir: string, name: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, name), TINY_PNG);
}

describe("pokemonCardFolderId", () => {
  it("pads numeric local ids to 3 digits", () => {
    expect(pokemonCardFolderId("4")).toBe("004");
    expect(pokemonCardFolderId("15")).toBe("015");
  });
});

describe("resolvePokemonCatalogueArtFilename", () => {
  it("returns a basename string synchronously (never a Promise)", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "poke-resolve-art-"));
    writeFace(path.join(root, "fr", "2023sv", "004"), "art.coleka.png");

    const art = resolvePokemonCatalogueArtFilename({
      setId: "2023sv",
      lang: "fr",
      localId: "4",
      cardsRoot: root,
    });
    expect(art).toBe("art.coleka.png");
    expect(typeof art).toBe("string");
  });
});

describe("localPokemonCatalogueArtUrl", () => {
  it("serves coleka art for 2023sv when Live is absent", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "poke-local-art-"));
    writeFace(path.join(root, "fr", "2023sv", "004"), "art.coleka.png");

    const url = localPokemonCatalogueArtUrl("pokemon:2023sv-4", "fr", root);
    expect(url).toBe("/assets/pokemon/cards/fr/2023sv/004/art.coleka.png");
    expect(url).not.toContain("object%20Promise");
    expect(url).not.toContain("[object Promise]");
  });

  it("joins Classic Collection via Live stem + remapped number", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "poke-me055c-"));
    // Live me5-5c #2 = Charizard — TCGdex me05.5c-001 must not hit /001 (Pikachu).
    writeFace(path.join(root, "fr", "me5-5c", "002"), "art.webp");
    writeFace(path.join(root, "fr", "me5-5c", "001"), "art.webp");

    expect(
      localPokemonCatalogueArtUrl("pokemon:me05.5c-001", "fr", root),
    ).toBe("/assets/pokemon/cards/fr/me5-5c/002/art.webp");
  });

  it("counts Live set-first dumps as catalogue art (same print)", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "poke-live-setfirst-"));
    // Live extract layout: cards/{set}/{lang}/{num}/art.webp
    writeFace(path.join(root, "bw2", "fr", "024"), "art.webp");

    expect(
      localPokemonCatalogueArtUrl("pokemon:bw2-24", "fr", root),
    ).toBe("/assets/pokemon/cards/fr/bw2/024/art.webp");
  });
});

describe("buildPokemonDiskArtAttachments", () => {
  it("emits one catalog cover per art.* and defaults to face.json winner", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "poke-multi-art-"));
    const cardDir = path.join(root, "fr", "2023sv", "004");
    writeFace(cardDir, "art.webp");
    writeFace(cardDir, "art.mcdn.png");
    writeFace(cardDir, "art.coleka.png");
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
      "/assets/pokemon/cards/fr/2023sv/004/art.mcdn.png",
    );
    expect(attachments[0]?.url).toBe(defaultUrl);
    expect(
      attachments.map((a) => a.role).sort(),
    ).toEqual(
      [
        "pokemon-face-fr-coleka",
        "pokemon-face-fr-live",
        "pokemon-face-fr-mcdn",
      ].sort(),
    );
  });
});
