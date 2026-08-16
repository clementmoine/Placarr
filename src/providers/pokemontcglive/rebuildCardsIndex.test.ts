import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { rebuildPokemonCardsIndex } from "./rebuildCardsIndex";

describe("rebuildPokemonCardsIndex", () => {
  const originalData = process.env.PLACARR_DATA_DIR;

  afterEach(() => {
    if (originalData === undefined) delete process.env.PLACARR_DATA_DIR;
    else process.env.PLACARR_DATA_DIR = originalData;
  });

  it("walks cards/ into CardsIndexV1 stems", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "placarr-poke-index-"));
    process.env.PLACARR_DATA_DIR = tmp;
    const cardDir = path.join(tmp, "pokemon", "cards", "me5", "fr", "045");
    mkdirSync(cardDir, { recursive: true });
    writeFileSync(path.join(cardDir, "art.webp"), "x");
    writeFileSync(path.join(cardDir, "mask.webp"), "x");
    writeFileSync(path.join(cardDir, "mask-ph.webp"), "x");

    const result = rebuildPokemonCardsIndex();
    expect(result.skipped).toBe(false);
    expect(result.cards).toBe(1);

    const raw = JSON.parse(readFileSync(result.path, "utf8")) as {
      version: number;
      pack: string;
      cards: Record<
        string,
        { langs: Record<string, { art?: string; variants?: unknown }> }
      >;
    };
    expect(raw.version).toBe(1);
    expect(raw.pack).toBe("pokemon");
    expect(raw.cards.me5_fr_045?.langs.fr?.art).toBe("art.webp");
    expect(raw.cards.me5_fr_045?.langs.fr?.variants).toEqual({
      ph: { mask: "mask-ph.webp" },
    });
  });

  it("soft-skips when cards/ is missing", () => {
    const tmp = mkdtempSync(
      path.join(os.tmpdir(), "placarr-poke-index-empty-"),
    );
    process.env.PLACARR_DATA_DIR = tmp;
    const result = rebuildPokemonCardsIndex();
    expect(result.skipped).toBe(true);
    expect(result.cards).toBe(0);
  });
});
