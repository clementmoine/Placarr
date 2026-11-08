import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";

import {
  buildPokemonDiskArtAttachments,
  localPokemonCatalogueArtUrl,
  pokemonCardFolderId,
  resolvePokemonCatalogueArtFilename,
} from "./paperCardDisk";

/** Minimal 1×1 PNG — face ranking probes dims and rejects empty stubs. */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function writeFace(dir: string, name: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, name), TINY_PNG);
}

async function writeFaceSized(
  dir: string,
  name: string,
  width: number,
  height: number,
): Promise<void> {
  mkdirSync(dir, { recursive: true });
  const buf = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 40, g: 80, b: 120 },
    },
  })
    .png()
    .toBuffer();
  writeFileSync(path.join(dir, name), buf);
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
  it("emits one catalog cover per art.* and defaults to ranked catalog dump", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "poke-multi-art-"));
    const cardDir = path.join(root, "fr", "2023sv", "004");
    writeFace(cardDir, "art.webp");
    await writeFaceSized(cardDir, "art.mcdn.png", 600, 840);
    writeFace(cardDir, "art.coleka.png");

    const { attachments, defaultUrl } = buildPokemonDiskArtAttachments({
      printKey: "pokemon:2023sv-4",
      language: "fr",
      source: "tcgdex",
      title: "Bulbizarre",
      cardsRoot: root,
    });

    expect(attachments).toHaveLength(3);
    expect(attachments.every((a) => a.source === "tcgdex")).toBe(true);
    // Larger catalog mcdn beats tiny live + listing coleka — face.json ignored.
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

  it("applies print_assets stamps only on the indexed winner", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "poke-stamp-winner-"));
    const cardDir = path.join(root, "fr", "2023sv", "004");
    await writeFaceSized(cardDir, "art.mcdn.png", 600, 840);
    writeFace(cardDir, "art.coleka.png");

    const { attachments } = buildPokemonDiskArtAttachments({
      printKey: "pokemon:2023sv-4",
      language: "fr",
      source: "tcgdex",
      cardsRoot: root,
      indexedArt: "art.coleka.png",
      artKind: "sample",
      watermarked: true,
    });

    const coleka = attachments.find((a) => a.url?.includes("art.coleka.png"));
    const mcdn = attachments.find((a) => a.url?.includes("art.mcdn.png"));
    expect(coleka?.artKind).toBe("sample");
    expect(coleka?.watermarked).toBe(true);
    expect(mcdn?.artKind).toBe("dump");
    expect(mcdn?.watermarked).toBe(false);
  });
});
