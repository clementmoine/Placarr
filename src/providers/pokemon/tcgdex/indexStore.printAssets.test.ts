/**
 * Pokémon identity store — `print_assets` bridge (CDN source_url + disk art).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { cardFromLocalRow } from "./index";
import {
  lookupTcgdexSearchRow,
  resetTcgdexIndexCache,
  syncTcgdexPrintAssetsFromDisk,
  writeTcgdexSet,
} from "./indexStore";

const roots: string[] = [];
afterEach(() => {
  resetTcgdexIndexCache();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

function tmpPokemonData(): { dataRoot: string; cardsRoot: string } {
  const dataRoot = mkdtempSync(path.join(os.tmpdir(), "placarr-tcgdex-assets-"));
  roots.push(dataRoot);
  vi.stubEnv("PLACARR_DATA_DIR", dataRoot);
  const cardsRoot = path.join(dataRoot, "pokemon", "cards");
  mkdirSync(cardsRoot, { recursive: true });
  return { dataRoot, cardsRoot };
}

describe("tcgdex print_assets", () => {
  it("writes source_url from CDN and joins art when disk has a face", () => {
    const { cardsRoot } = tmpPokemonData();
    const cardDir = path.join(cardsRoot, "fr", "swsh3", "001");
    mkdirSync(cardDir, { recursive: true });
    writeFileSync(path.join(cardDir, "art.coleka.webp"), "face");

    const written = writeTcgdexSet({
      cardsRoot,
      set: {
        setId: "swsh3",
        lang: "fr",
        name: "Ténèbres Embrasées",
        serieName: "Épée et Bouclier",
        releasedAt: "2020-08-14",
        totalCount: 1,
        officialCount: 1,
      },
      prints: [
        {
          printKey: "pokemon:swsh3-1",
          setId: "swsh3",
          localId: "1",
          providerId: "swsh3-1",
          imageBaseUrl: "https://assets.tcgdex.net/fr/swsh/swsh3/1",
        },
      ],
      titles: [
        {
          printKey: "pokemon:swsh3-1",
          lang: "fr",
          name: "Papilusion V",
          setName: "Ténèbres Embrasées",
          serieName: "Épée et Bouclier",
        },
      ],
    });

    expect(written.assetsFromDisk).toBe(1);

    const row = lookupTcgdexSearchRow("pokemon:swsh3-1", { language: "fr" });
    expect(row?.art).toBe("art.coleka.webp");
    expect(row?.imageBaseUrl).toBe(
      "https://assets.tcgdex.net/fr/swsh/swsh3/1",
    );

    const card = cardFromLocalRow(row!);
    expect(card.imageUrl).toBe(
      "/assets/pokemon/cards/fr/swsh3/001/art.coleka.webp",
    );
    expect(card.thumbnailUrl).toBe(card.imageUrl);
  });

  it("falls back to CDN when print_assets.art is empty", () => {
    tmpPokemonData();
    writeTcgdexSet({
      set: {
        setId: "swsh3",
        lang: "fr",
        name: "Ténèbres Embrasées",
        serieName: null,
        releasedAt: "2020-08-14",
        totalCount: 1,
        officialCount: 1,
      },
      prints: [
        {
          printKey: "pokemon:swsh3-1",
          setId: "swsh3",
          localId: "1",
          providerId: "swsh3-1",
          imageBaseUrl: "https://assets.tcgdex.net/fr/swsh/swsh3/1",
        },
      ],
      titles: [
        {
          printKey: "pokemon:swsh3-1",
          lang: "fr",
          name: "Papilusion V",
          setName: "Ténèbres Embrasées",
          serieName: null,
        },
      ],
    });

    const row = lookupTcgdexSearchRow("pokemon:swsh3-1", { language: "fr" });
    expect(row?.art).toBeNull();
    const card = cardFromLocalRow(row!);
    expect(card.imageUrl).toContain("assets.tcgdex.net");
    expect(card.imageUrl).toContain("/high.webp");
  });

  it("backfills art onto an existing row via syncTcgdexPrintAssetsFromDisk", () => {
    const { cardsRoot } = tmpPokemonData();
    writeTcgdexSet({
      cardsRoot,
      set: {
        setId: "base1",
        lang: "fr",
        name: "Set de Base",
        serieName: null,
        releasedAt: null,
        totalCount: 1,
        officialCount: 1,
      },
      prints: [
        {
          printKey: "pokemon:base1-4",
          setId: "base1",
          localId: "4",
          providerId: "base1-4",
          imageBaseUrl: "https://assets.tcgdex.net/en/base/base1/4",
        },
      ],
      titles: [
        {
          printKey: "pokemon:base1-4",
          lang: "fr",
          name: "Dracaufeu",
          setName: "Set de Base",
          serieName: null,
        },
      ],
    });
    expect(
      lookupTcgdexSearchRow("pokemon:base1-4", { language: "fr" })?.art,
    ).toBeNull();

    const cardDir = path.join(cardsRoot, "fr", "base1", "004");
    mkdirSync(cardDir, { recursive: true });
    writeFileSync(path.join(cardDir, "art.tcgdex.webp"), "cdn");

    const synced = syncTcgdexPrintAssetsFromDisk({
      cardsRoot,
      printKeys: ["pokemon:base1-4"],
      languages: ["fr"],
    });
    expect(synced).toBe(1);
    expect(
      lookupTcgdexSearchRow("pokemon:base1-4", { language: "fr" })?.art,
    ).toBe("art.tcgdex.webp");
  });
});
