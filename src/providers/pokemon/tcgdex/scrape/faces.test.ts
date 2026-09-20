/**
 * Aggregated tests for Pokémon face fillers + faceChoice.
 */
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  POKEMON_FACE_SOURCES,
  pokemonFaceSourceOf,
  pickBestPokemonFace,
  refreshPokemonFaceDecision,
  resolvePokemonArtFilename,
} from "../disk/faceChoice";
import {
  buildPkmcardsAbbrToLiveStem,
  fillMcdnFacesForSet,
  fillPkmcardsFaces,
  fillPokemonComMcdoCampaign,
  fillTcgdexCatalogueFaces,
  fillTcgplayerFacesForSet,
  parseMcdnLocalIds,
  parsePkmcardsPokemonSlug,
  pokemonComMcdoImageUrl,
  pokemonMcdnCandidateUrls,
  pokemonMcdnCardNumber,
  pokemonMcdnCms2Url,
  pokemonMcdnCms3Url,
  pokemonMcdnGalleryCodes,
  POKEMONTCG_MCDO_STEMS,
  pokemontcgIoMcdoImageUrl,
  tcgplayerIdFromCardPayload,
  tcgplayerProductImageUrl,
} from "./faces";


// —— fillMcdnFaces.test.ts ——

describe("pokemonMcdnGalleryCodes", () => {
  it("pads SV stems and keeps SWSH unpadded preference", () => {
    expect(pokemonMcdnGalleryCodes("sv8", {})).toEqual(
      expect.arrayContaining(["SV08", "SV8"]),
    );
    expect(pokemonMcdnGalleryCodes("swsh6", {})[0]).toBe("SWSH6");
  });

  it("honours curated aliases for Live me5-5 → encyclopédie 30TH", () => {
    expect(pokemonMcdnGalleryCodes("me5-5", { "me5-5": "30TH" })[0]).toBe(
      "30TH",
    );
  });
});

describe("pokemonMcdnUrls", () => {
  it("builds cms3 then cms2 candidates with unpadded numbers", () => {
    expect(pokemonMcdnCardNumber("033")).toBe("33");
    expect(pokemonMcdnCms3Url("30TH", "fr", 33)).toContain(
      "/cms3/fr/img/cards/full/30TH/30TH_FR_33.png",
    );
    expect(pokemonMcdnCms2Url("SV08", "en", 1)).toContain(
      "/cms2/img/cards/web/SV08/SV08_EN_1.png",
    );
    expect(pokemonMcdnCandidateUrls("30TH", "fr", 33)[0]).toContain(
      "/cards/full/",
    );
    expect(pokemonMcdnCandidateUrls("30TH", "fr", 33)[1]).toContain(
      "/cards/web/",
    );
  });
});

describe("parseMcdnLocalIds", () => {
  it("expands inclusive ranges", () => {
    expect(parseMcdnLocalIds("1-3")).toEqual(["1", "2", "3"]);
  });
});

describe("fillMcdnFacesForSet", () => {
  it("writes art.mcdn.png preferring the first successful candidate URL", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "poke-mcdn-"));
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...Array(600).fill(2),
    ]);
    const seen: string[] = [];
    const report = await fillMcdnFacesForSet({
      setId: "me5-5",
      lang: "fr",
      galleryCode: "30TH",
      localIds: ["33"],
      cardsRoot: root,
      downloadImage: async (url) => {
        seen.push(url);
        if (url.includes("/cards/full/")) return png;
        return null;
      },
    });
    expect(report.written).toBe(1);
    expect(seen[0]).toContain("/cards/full/30TH/30TH_FR_33.png");
    const cardDir = path.join(root, "me5-5", "fr", "033");
    expect(existsSync(path.join(cardDir, "art.mcdn.png"))).toBe(true);
    const decision = JSON.parse(
      readFileSync(path.join(cardDir, "face.json"), "utf8"),
    ) as { art: string };
    expect(decision.art).toBe("art.mcdn.png");
  });
});

// —— fillPkmcards.test.ts ——

describe("parsePkmcardsPokemonSlug", () => {
  it("lit set-lang-num au milieu du slug (pas le préfixe DBS)", () => {
    expect(
      parsePkmcardsPokemonSlug(
        "pbl-fr-001-mega-evolution-nuit-noire-tropius",
      ),
    ).toEqual({ setAbbr: "pbl", lang: "fr", number: "001" });
    expect(
      parsePkmcardsPokemonSlug(
        "dri-fr-147-ecarlate-et-violet-rivalites-destinees-rattata",
      ),
    ).toEqual({ setAbbr: "dri", lang: "fr", number: "147" });
    expect(parsePkmcardsPokemonSlug("en-bt25-009-sr-gogeta")).toBeNull();
  });
});

describe("buildPkmcardsAbbrToLiveStem", () => {
  it("reconnaît un stem Live déjà sur disque", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pkm-map-"));
    mkdirSync(path.join(root, "me5"), { recursive: true });
    mkdirSync(path.join(root, "sv10"), { recursive: true });
    const map = buildPkmcardsAbbrToLiveStem(root);
    expect(map.get("me5")?.liveStem).toBe("me5");
    expect(map.get("sv10")?.liveStem).toBe("sv10");
  });
});

describe("fillPkmcardsFaces", () => {
  it("prend art.pkmcards même si Live art.webp est déjà là (skip seulement la source)", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pkm-fill-"));
    const withLive = path.join(root, "me5", "fr", "002");
    const already = path.join(root, "me5", "fr", "003");
    mkdirSync(withLive, { recursive: true });
    mkdirSync(already, { recursive: true });
    writeFileSync(path.join(withLive, "art.webp"), "live");
    writeFileSync(path.join(already, "art.pkmcards.webp"), "have");

    const entries = [
      {
        itemId: "1",
        slug: "me5-fr-001-tropius",
        ref: null,
        sku: null,
        name: "Tropius",
        lang: "fr",
        priceText: null,
        price: null,
        currency: null,
        priceDeltaText: null,
        priceDelta: null,
        imageFront: "https://example.test/001.webp",
        imageBack: null,
      },
      {
        itemId: "2",
        slug: "me5-fr-002-larvibule",
        ref: null,
        sku: null,
        name: "Larvibule",
        lang: "fr",
        priceText: null,
        price: null,
        currency: null,
        priceDeltaText: null,
        priceDelta: null,
        imageFront: "https://example.test/002.webp",
        imageBack: null,
      },
      {
        itemId: "3",
        slug: "me5-fr-003-mimantis",
        ref: null,
        sku: null,
        name: "Mimantis",
        lang: "fr",
        priceText: null,
        price: null,
        currency: null,
        priceDeltaText: null,
        priceDelta: null,
        imageFront: "https://example.test/003.webp",
        imageBack: null,
      },
      {
        itemId: "4",
        slug: "zzz-fr-001-unknown-set",
        ref: null,
        sku: null,
        name: "X",
        lang: "fr",
        priceText: null,
        price: null,
        currency: null,
        priceDeltaText: null,
        priceDelta: null,
        imageFront: "https://example.test/x.webp",
        imageBack: null,
      },
    ];

    const report = await fillPkmcardsFaces({
      cardsRoot: root,
      entries,
      downloadDelayMs: 0,
    });

    expect(report.skipped).toBe(1); // 003 déjà art.pkmcards
    expect(report.unmapped).toBe(1); // zzz
    // 001 (mkdir) + 002 (malgré live) tentent le download → fail sans serveur
    expect(report.tried).toBe(2);
    expect(report.failed).toBe(2);
    expect(existsSync(path.join(already, "art.pkmcards.webp"))).toBe(true);
  });
});

// —— fillPokemonComMcdo.test.ts ——

describe("pokemonComMcdoImageUrl", () => {
  it("pads nn in the Happy Meal tile path", () => {
    expect(
      pokemonComMcdoImageUrl(
        "https://mcdn.example/base",
        "cms2/img/misc/_tiles/happy-meal/2023/inline/full/{nn}-en.png",
        4,
      ),
    ).toBe(
      "https://mcdn.example/base/cms2/img/misc/_tiles/happy-meal/2023/inline/full/04-en.png",
    );
  });
});

describe("fillPokemonComMcdoCampaign", () => {
  it("writes art.pokemoncom.png and prefers it over tcgplayer", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "poke-pcom-"));
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(600).fill(1)]);
    const report = await fillPokemonComMcdoCampaign({
      baseUrl: "https://mcdn.example/base",
      campaign: {
        id: "test",
        setId: "2023sv",
        lang: "en",
        cardCount: 2,
        pathTemplate: "happy/{nn}-en.png",
      },
      cardsRoot: root,
      downloadImage: async (url) => {
        expect(url).toMatch(/happy\/0[12]-en\.png$/);
        return png;
      },
    });
    expect(report.written).toBe(2);
    expect(report.failed).toBe(0);
    const cardDir = path.join(root, "2023sv", "en", "001");
    expect(existsSync(path.join(cardDir, "art.pokemoncom.png"))).toBe(true);
    const decision = JSON.parse(
      readFileSync(path.join(cardDir, "face.json"), "utf8"),
    ) as { art: string };
    expect(decision.art).toBe("art.pokemoncom.png");
  });
});

// —— fillTcgplayer.test.ts ——

describe("tcgplayerProductImageUrl", () => {
  it("builds the 1000px CDN URL", () => {
    expect(tcgplayerProductImageUrl(516515)).toBe(
      "https://product-images.tcgplayer.com/fit-in/1000x1000/516515.jpg",
    );
  });
});

describe("tcgplayerIdFromCardPayload", () => {
  it("reads the first variants_detailed tcgplayer id", () => {
    expect(
      tcgplayerIdFromCardPayload({
        variants_detailed: [{ thirdParty: { tcgplayer: 516515 } }],
      }),
    ).toBe(516515);
    expect(tcgplayerIdFromCardPayload({})).toBeNull();
  });
});

describe("fillTcgplayerFacesForSet", () => {
  it("writes art.tcgplayer.jpg for 2023sv-4 en", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "poke-tcgp-"));
    const jpeg = Buffer.alloc(600, 1);
    jpeg[0] = 0xff;
    jpeg[1] = 0xd8;

    const report = await fillTcgplayerFacesForSet({
      setId: "2023sv",
      localIds: ["4"],
      lang: "en",
      cardsRoot: path.join(root, "cards"),
      fetchCard: async () => ({
        variants_detailed: [{ thirdParty: { tcgplayer: 516515 } }],
      }),
      downloadImage: async () => jpeg,
    });

    expect(report.written).toBe(1);
    const dest = path.join(
      root,
      "cards",
      "2023sv",
      "en",
      "004",
      "art.tcgplayer.jpg",
    );
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(dest).byteLength).toBe(600);
  });
});

describe("pokemontcgIoMcdoImageUrl", () => {
  it("maps known stems and skips 2023", () => {
    expect(POKEMONTCG_MCDO_STEMS["2022swsh"]).toBe("mcd22");
    expect(POKEMONTCG_MCDO_STEMS["2023sv"]).toBeUndefined();
    expect(pokemontcgIoMcdoImageUrl("mcd22", "4")).toBe(
      "https://images.pokemontcg.io/mcd22/4_hires.png",
    );
  });
});

// —— faceChoice.test.ts ——

describe("pokemonFaceSourceOf", () => {
  it("maps bare Live art and multi-source dumps", () => {
    expect(pokemonFaceSourceOf("art.webp")).toBe("live");
    expect(pokemonFaceSourceOf("art.png")).toBe("live");
    expect(pokemonFaceSourceOf("art.coleka.webp")).toBe("coleka");
    expect(pokemonFaceSourceOf("art.pokemoncom.png")).toBe("pokemoncom");
    expect(pokemonFaceSourceOf("art.pokecardex.jpg")).toBe("pokecardex");
    expect(pokemonFaceSourceOf("art.mcdn.png")).toBe("mcdn");
    expect(pokemonFaceSourceOf("art.tcgdex.png")).toBe("tcgdex");
    expect(pokemonFaceSourceOf("art.tcgplayer.jpg")).toBe("tcgplayer");
    expect(pokemonFaceSourceOf("art.pokemontcg.png")).toBe("pokemontcg");
    expect(pokemonFaceSourceOf("art.pkmcards.webp")).toBe("pkmcards");
    expect(pokemonFaceSourceOf("mask.webp")).toBeNull();
  });
});

describe("pickBestPokemonFace", () => {
  it("ranks live above mcdn above pokemoncom above pokecardex above coleka above tcgdex", () => {
    expect(POKEMON_FACE_SOURCES[0]).toBe("live");
    expect(POKEMON_FACE_SOURCES[1]).toBe("mcdn");
    expect(POKEMON_FACE_SOURCES[2]).toBe("pokemoncom");
    expect(POKEMON_FACE_SOURCES[3]).toBe("pokecardex");
    expect(POKEMON_FACE_SOURCES[4]).toBe("coleka");
    expect(POKEMON_FACE_SOURCES[5]).toBe("tcgdex");
    expect(
      pickBestPokemonFace(
        [
          { source: "coleka", width: 0, height: 0 },
          { source: "live", width: 0, height: 0 },
          { source: "mcdn", width: 0, height: 0 },
        ],
        "fr",
      ),
    ).toBe("live");
    expect(
      pickBestPokemonFace(
        [
          { source: "pokemoncom", width: 0, height: 0 },
          { source: "mcdn", width: 0, height: 0 },
          { source: "coleka", width: 0, height: 0 },
        ],
        "en",
      ),
    ).toBe("mcdn");
    expect(
      pickBestPokemonFace(
        [
          { source: "tcgplayer", width: 0, height: 0 },
          { source: "coleka", width: 0, height: 0 },
          { source: "pokecardex", width: 0, height: 0 },
          { source: "pokemoncom", width: 0, height: 0 },
        ],
        "en",
      ),
    ).toBe("pokemoncom");
    expect(
      pickBestPokemonFace(
        [
          { source: "tcgplayer", width: 0, height: 0 },
          { source: "coleka", width: 0, height: 0 },
          { source: "pokecardex", width: 0, height: 0 },
        ],
        "fr",
      ),
    ).toBe("pokecardex");
    expect(
      pickBestPokemonFace(
        [
          { source: "tcgplayer", width: 0, height: 0 },
          { source: "tcgdex", width: 0, height: 0 },
        ],
        "en",
      ),
    ).toBe("tcgdex");
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

describe("fillTcgdexCatalogueFaces", () => {
  it("writes localized art.tcgdex.png and skips on second pass", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "poke-tcgdex-faces-"));
    const seen: string[] = [];
    const report = await fillTcgdexCatalogueFaces({
      cardsRoot: root,
      langs: ["fr"],
      concurrency: 2,
      prints: [
        {
          setId: "base1",
          localId: "4",
          imageBaseUrl: "https://assets.tcgdex.net/en/base/base1/4",
        },
      ],
      downloadImage: async (url) => {
        seen.push(url);
        if (url.includes("/fr/") && url.endsWith("/high.webp")) {
          return Buffer.alloc(600, 1);
        }
        return null;
      },
    });
    expect(report.written).toBe(1);
    expect(report.failed).toBe(0);
    expect(seen[0]).toBe(
      "https://assets.tcgdex.net/fr/base/base1/4/high.webp",
    );
    const dest = path.join(root, "base1", "fr", "004", "art.tcgdex.webp");
    expect(existsSync(dest)).toBe(true);

    const second = await fillTcgdexCatalogueFaces({
      cardsRoot: root,
      langs: ["fr"],
      prints: [
        {
          setId: "base1",
          localId: "4",
          imageBaseUrl: "https://assets.tcgdex.net/en/base/base1/4",
        },
      ],
      downloadImage: async () => {
        throw new Error("should not download");
      },
    });
    expect(second.skipped).toBe(1);
    expect(second.written).toBe(0);
  });

  it("does not copy a JA CDN face into the FR folder", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "poke-tcgdex-ja-"));
    const seen: string[] = [];
    const report = await fillTcgdexCatalogueFaces({
      cardsRoot: root,
      langs: ["fr"],
      prints: [
        {
          setId: "S10P",
          localId: "001",
          imageBaseUrl: "https://assets.tcgdex.net/ja/S/S10P/001",
        },
      ],
      downloadImage: async (url) => {
        seen.push(url);
        if (url.includes("/ja/") && url.endsWith("/high.webp")) {
          return Buffer.alloc(600, 2);
        }
        return null;
      },
    });
    expect(report.written).toBe(0);
    expect(report.failed).toBe(1);
    expect(seen.every((u) => u.includes("/fr/"))).toBe(true);
    expect(
      existsSync(path.join(root, "s10p", "fr", "001", "art.tcgdex.webp")),
    ).toBe(false);
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
