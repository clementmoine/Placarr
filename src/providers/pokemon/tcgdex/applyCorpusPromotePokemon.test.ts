import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { applyCorpusPromotePokemon } from "./applyCorpusPromotePokemon";
import {
  lookupTcgdexSearchRow,
  resetTcgdexIndexCache,
  writeTcgdexSet,
} from "./indexStore";

const roots: string[] = [];
afterEach(() => {
  resetTcgdexIndexCache();
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

function tmpPokemonData(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pk-promote-"));
  roots.push(root);
  vi.stubEnv("PLACARR_DATA_DIR", root);
  return root;
}

describe("applyCorpusPromotePokemon", () => {
  it("writes a print + title into a cold identity DB", () => {
    tmpPokemonData();
    const result = applyCorpusPromotePokemon({
      printKey: "pokemon:sv08-42",
      title: "Pikachu Promo Shelf",
      language: "fr",
    });
    expect(result).toEqual({
      written: true,
      printKey: "pokemon:sv08-42",
    });
    const row = lookupTcgdexSearchRow("pokemon:sv08-42", { language: "fr" });
    expect(row).toMatchObject({
      printKey: "pokemon:sv08-42",
      setId: "sv08",
      localId: "42",
      name: "Pikachu Promo Shelf",
    });
  });

  it("preserves an existing set name on promote", () => {
    tmpPokemonData();
    writeTcgdexSet({
      set: {
        setId: "sv08",
        lang: "fr",
        name: "Étincelles Déferlantes",
        serieName: "Écarlate et Violet",
        releasedAt: "2024-11-08",
        totalCount: 252,
        officialCount: 191,
      },
      prints: [],
      titles: [],
    });

    const result = applyCorpusPromotePokemon({
      printKey: "pokemon:sv08-99",
      title: "Shelf Card",
      language: "fr",
    });
    expect(result.written).toBe(true);

    const row = lookupTcgdexSearchRow("pokemon:sv08-99", { language: "fr" });
    expect(row).toMatchObject({
      name: "Shelf Card",
      setName: "Étincelles Déferlantes",
      serieName: "Écarlate et Violet",
    });
  });

  it("rejects a foreign printGame", () => {
    tmpPokemonData();
    const result = applyCorpusPromotePokemon({
      printKey: "naruto:nr-0001",
      title: "Wrong",
    });
    expect(result.written).toBe(false);
    if (!result.written) {
      expect(result.reason).toMatch(/≠ corpus pokemon/);
    }
  });
});
