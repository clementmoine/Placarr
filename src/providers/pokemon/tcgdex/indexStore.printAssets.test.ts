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

/** 1×1 PNG — faceChoice needs probeable dims (not bare text stubs). */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

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

function writeFace(cardDir: string, filename: string): void {
  mkdirSync(cardDir, { recursive: true });
  writeFileSync(path.join(cardDir, filename), PNG_1X1);
}

describe("tcgdex print_assets", () => {
  it("writes source_url from CDN and joins art when disk has a face", () => {
    const { cardsRoot } = tmpPokemonData();
    writeFace(path.join(cardsRoot, "fr", "swsh3", "001"), "art.coleka.png");

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
    expect(row?.art).toBe("art.coleka.png");
    expect(row?.imageBaseUrl).toBe(
      "https://assets.tcgdex.net/fr/swsh/swsh3/1",
    );

    const card = cardFromLocalRow(row!);
    expect(card.imageUrl).toBe(
      "/assets/pokemon/cards/fr/swsh3/001/art.coleka.png",
    );
    expect(card.thumbnailUrl).toBe(card.imageUrl);
  });

  it("exposes no runtime art when disk face is absent (CDN is Sync-only)", () => {
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
    expect(row?.imageBaseUrl).toBe(
      "https://assets.tcgdex.net/fr/swsh/swsh3/1",
    );
    const card = cardFromLocalRow(row!);
    expect(card.imageUrl).toBeNull();
    expect(card.thumbnailUrl).toBeNull();
    expect(card.imageBaseUrl).toBe(
      "https://assets.tcgdex.net/fr/swsh/swsh3/1",
    );
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

    writeFace(path.join(cardsRoot, "fr", "base1", "004"), "art.tcgdex.png");

    const synced = syncTcgdexPrintAssetsFromDisk({
      cardsRoot,
      printKeys: ["pokemon:base1-4"],
      languages: ["fr"],
    });
    expect(synced).toBe(1);
    expect(
      lookupTcgdexSearchRow("pokemon:base1-4", { language: "fr" })?.art,
    ).toBe("art.tcgdex.png");
  });

  it("clears ghost print_assets.art when the face file is missing", () => {
    const { cardsRoot } = tmpPokemonData();
    const cardDir = path.join(cardsRoot, "fr", "bw2", "024");
    writeFace(cardDir, "art.pokecardex.png");

    writeTcgdexSet({
      cardsRoot,
      set: {
        setId: "bw2",
        lang: "fr",
        name: "Émeraude Noire",
        serieName: null,
        releasedAt: null,
        totalCount: 1,
        officialCount: 1,
      },
      prints: [
        {
          printKey: "pokemon:bw2-24",
          setId: "bw2",
          localId: "24",
          providerId: "bw2-24",
          imageBaseUrl: "https://assets.tcgdex.net/fr/bw/bw2/24",
        },
      ],
      titles: [
        {
          printKey: "pokemon:bw2-24",
          lang: "fr",
          name: "Feuillajou",
          setName: "Émeraude Noire",
          serieName: null,
        },
      ],
    });
    expect(
      lookupTcgdexSearchRow("pokemon:bw2-24", { language: "fr" })?.art,
    ).toBe("art.pokecardex.png");

    rmSync(cardDir, { recursive: true, force: true });

    const synced = syncTcgdexPrintAssetsFromDisk({
      cardsRoot,
      printKeys: ["pokemon:bw2-24"],
      languages: ["fr"],
    });
    expect(synced).toBe(1);
    expect(
      lookupTcgdexSearchRow("pokemon:bw2-24", { language: "fr" })?.art,
    ).toBeNull();

    const card = cardFromLocalRow(
      lookupTcgdexSearchRow("pokemon:bw2-24", { language: "fr" })!,
    );
    expect(card.imageUrl).toBeNull();
    expect(card.thumbnailUrl).toBeNull();
  });
});
