import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  POKEMON_FACE_SOURCES,
  pokemonFaceSourceOf,
  pickBestPokemonFace,
  refreshPokemonFaceDecision,
  resolvePokemonArtFilename,
} from "./faceChoice";

describe("pokemonFaceSourceOf", () => {
  it("maps bare Live art and multi-source dumps", () => {
    expect(pokemonFaceSourceOf("art.webp")).toBe("live");
    expect(pokemonFaceSourceOf("art.png")).toBe("live");
    expect(pokemonFaceSourceOf("art.coleka.webp")).toBe("coleka");
    expect(pokemonFaceSourceOf("art.tcgplayer.jpg")).toBe("tcgplayer");
    expect(pokemonFaceSourceOf("art.pokemontcg.png")).toBe("pokemontcg");
    expect(pokemonFaceSourceOf("art.pkmcards.webp")).toBe("pkmcards");
    expect(pokemonFaceSourceOf("mask.webp")).toBeNull();
  });
});

describe("pickBestPokemonFace", () => {
  it("ranks live above coleka above tcgplayer", () => {
    expect(POKEMON_FACE_SOURCES[0]).toBe("live");
    expect(
      pickBestPokemonFace(
        [
          { source: "coleka", width: 0, height: 0 },
          { source: "live", width: 0, height: 0 },
          { source: "tcgplayer", width: 0, height: 0 },
        ],
        "fr",
      ),
    ).toBe("live");
    expect(
      pickBestPokemonFace(
        [
          { source: "tcgplayer", width: 0, height: 0 },
          { source: "coleka", width: 0, height: 0 },
        ],
        "fr",
      ),
    ).toBe("coleka");
    expect(
      pickBestPokemonFace(
        [
          { source: "pokemontcg", width: 0, height: 0 },
          { source: "tcgplayer", width: 0, height: 0 },
        ],
        "en",
      ),
    ).toBe("tcgplayer");
  });
});

describe("resolvePokemonArtFilename", () => {
  it("prefers live art.webp over art.coleka when both exist", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "poke-face-"));
    writeFileSync(path.join(dir, "art.webp"), "live");
    writeFileSync(path.join(dir, "art.coleka.webp"), "coleka");
    expect(resolvePokemonArtFilename(dir, "fr")).toBe("art.webp");
    expect(refreshPokemonFaceDecision(dir, "fr")).toBe("art.webp");
    const decision = JSON.parse(
      readFileSync(path.join(dir, "face.json"), "utf8"),
    ) as { art: string };
    expect(decision.art).toBe("art.webp");
  });

  it("picks coleka alone", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "poke-face-c-"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "art.coleka.webp"), "x");
    expect(resolvePokemonArtFilename(dir, "fr")).toBe("art.coleka.webp");
  });
});
