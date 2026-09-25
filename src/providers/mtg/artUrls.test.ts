import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearMtgArtUrlCache,
  resolveMtgArtUrl,
  type MtgArtUrlMap,
} from "./artUrls";
import { decorateMtgCandidate, resetMtgFinishesCache } from "./finishes";

describe("resolveMtgArtUrl", () => {
  it("prefers tile lang, then en, then fr", () => {
    const map: MtgArtUrlMap = {
      "mtg:lea-161": {
        de: "https://cards.scryfall.io/de.jpg",
        en: "https://cards.scryfall.io/en.jpg",
        fr: "https://cards.scryfall.io/fr.jpg",
      },
    };
    expect(resolveMtgArtUrl(map, "mtg:lea-161", "fr")).toEqual({
      url: "https://cards.scryfall.io/fr.jpg",
      artLang: "fr",
    });
    expect(resolveMtgArtUrl(map, "mtg:lea-161", "ja")).toEqual({
      url: "https://cards.scryfall.io/en.jpg",
      artLang: "en",
    });
  });

  it("returns null when the print has no CDN slot", () => {
    expect(resolveMtgArtUrl({}, "mtg:missing-1", "en")).toBeNull();
  });

  it("skips Scryfall soon.jpg placeholders and falls back to EN", () => {
    const map: MtgArtUrlMap = {
      "mtg:dsk-60": {
        fr: "https://errors.scryfall.com/soon.jpg",
        en: "https://cards.scryfall.io/en/dsk-60.jpg",
      },
    };
    expect(resolveMtgArtUrl(map, "mtg:dsk-60", "fr")).toEqual({
      url: "https://cards.scryfall.io/en/dsk-60.jpg",
      artLang: "en",
    });
  });
});

describe("decorateMtgCandidate", () => {
  const prevCwd = process.cwd();
  let tmpRoot: string;

  afterEach(() => {
    process.chdir(prevCwd);
    resetMtgFinishesCache();
    clearMtgArtUrlCache();
    vi.restoreAllMocks();
  });

  it("fills imageUrl from lang-keyed art-urls.json when disk face is absent", () => {
    tmpRoot = mkdtempSync(path.join(os.tmpdir(), "mtg-art-"));
    const curated = path.join(tmpRoot, "data", "mtg", "curated");
    mkdirSync(curated, { recursive: true });
    writeFileSync(
      path.join(curated, "art-urls.json"),
      JSON.stringify({
        "mtg:tdm-1": {
          en: "https://cards.scryfall.io/en/tdm-1.jpg",
          fr: "https://cards.scryfall.io/fr/tdm-1.jpg",
        },
      }) + "\n",
    );
    writeFileSync(path.join(curated, "finishes.json"), "{}\n");
    process.chdir(tmpRoot);

    const decorated = decorateMtgCandidate(
      {
        printKey: "mtg:tdm-1",
        title: "Abraded Bluffs",
        reference: "TDM-1",
        language: "fr",
        printed: true,
        effectPack: "mtg",
      },
      {
        printKey: "mtg:tdm-1",
        setCode: "tdm",
        number: "1",
        cardType: "tdm",
        grouping: null,
        category: null,
        lang: "fr",
        fullName: "Falaises abrasées",
        rarity: "common",
        art: null,
        thumb: null,
        back: null,
      },
    );
    expect(decorated.imageUrl).toBe(
      "https://cards.scryfall.io/fr/tdm-1.jpg",
    );
  });

  it("does not override an existing local imageUrl", () => {
    tmpRoot = mkdtempSync(path.join(os.tmpdir(), "mtg-art-"));
    const curated = path.join(tmpRoot, "data", "mtg", "curated");
    mkdirSync(curated, { recursive: true });
    writeFileSync(
      path.join(curated, "art-urls.json"),
      JSON.stringify({
        "mtg:tdm-1": { fr: "https://cards.scryfall.io/fr.jpg" },
      }) + "\n",
    );
    writeFileSync(path.join(curated, "finishes.json"), "{}\n");
    process.chdir(tmpRoot);

    const decorated = decorateMtgCandidate({
      printKey: "mtg:tdm-1",
      title: "x",
      reference: "TDM-1",
      language: "fr",
      printed: true,
      effectPack: "mtg",
      imageUrl: "/assets/mtg/cards/tdm/fr/1/art.mtgcards.webp",
    });
    expect(decorated.imageUrl).toBe(
      "/assets/mtg/cards/tdm/fr/1/art.mtgcards.webp",
    );
  });
});
