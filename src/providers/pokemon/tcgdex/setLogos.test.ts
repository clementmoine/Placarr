import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const httpGet = vi.fn();

vi.mock("@/lib/http/httpClient", () => ({
  httpGet: (...args: unknown[]) => httpGet(...args),
}));

import {
  __resetDigitalOnlyCacheForTests,
  __seedDigitalOnlyCacheForTests,
} from "./digitalOnly";
import {
  __resetTcgdexSetLogoIndexForTests,
  pokecardexFallbackGlyphCode,
  pokecardexSymbolUrl,
  refreshTcgdexSetLogoIndex,
  tcgdexCatalogueSetIdForProduct,
  tcgdexLogoUrlForProduct,
  tcgdexLogoUrlForSetCode,
  tcgdexSetAssetUrl,
  tcgdexSetSymbolCandidates,
  tcgdexSetSymbolUrl,
  tcgdexWorkingSymbolUrl,
  withTcgdexSetSymbols,
  type TcgdexSetLogoIndex,
} from "./setLogos";

const FIXTURE: TcgdexSetLogoIndex = {
  version: 2,
  language: "fr",
  fetchedAt: "2026-08-16T00:00:00.000Z",
  sets: [
    {
      id: "sv08.5",
      name: "Évolutions Prismatiques",
      officialAbbr: "PRE",
      localizedAbbr: null,
      tcgOnline: "PRE",
      logo: "https://assets.tcgdex.net/fr/sv/sv08.5/logo.png",
      symbol: "https://assets.tcgdex.net/univ/sv/sv08.5/symbol.png",
    },
    {
      id: "sv01",
      name: "Écarlate et Violet",
      officialAbbr: "SVI",
      localizedAbbr: null,
      tcgOnline: "SVI",
      logo: "https://assets.tcgdex.net/fr/sv/sv01/logo.png",
      symbol: null,
    },
    {
      id: "me04",
      name: "Aventures Ensemble",
      officialAbbr: "CRI",
      localizedAbbr: null,
      tcgOnline: null,
      logo: "https://assets.tcgdex.net/fr/me/me04/logo.png",
      symbol: null,
    },
    {
      id: "pgo",
      name: "Pokémon GO",
      officialAbbr: "PGO",
      localizedAbbr: null,
      tcgOnline: null,
      logo: null,
      symbol: "https://assets.tcgdex.net/univ/swsh/pgo/symbol.png",
    },
    {
      id: "dup-a",
      name: "Collision",
      officialAbbr: "CLASH",
      localizedAbbr: null,
      tcgOnline: null,
      logo: "https://example.test/a.png",
      symbol: null,
    },
    {
      id: "dup-b",
      name: "Collision bis",
      officialAbbr: "CLASH",
      localizedAbbr: null,
      tcgOnline: null,
      logo: "https://example.test/b.png",
      symbol: null,
    },
  ],
};

describe("tcgdexSetAssetUrl", () => {
  it("appends .png to a TCGdex logo base and leaves a file URL alone", () => {
    expect(tcgdexSetAssetUrl("https://assets.tcgdex.net/fr/me/me04/logo")).toBe(
      "https://assets.tcgdex.net/fr/me/me04/logo.png",
    );
    expect(
      tcgdexSetAssetUrl("https://assets.tcgdex.net/fr/me/me04/logo.png"),
    ).toBe("https://assets.tcgdex.net/fr/me/me04/logo.png");
    expect(tcgdexSetAssetUrl("")).toBeNull();
  });
});

describe("tcgdexLogoUrlForSetCode", () => {
  it("matches official abbr, id, and TCGO code, preferring the wordmark", () => {
    expect(tcgdexLogoUrlForSetCode("PRE", FIXTURE)).toBe(
      "https://assets.tcgdex.net/fr/sv/sv08.5/logo.png",
    );
    expect(tcgdexLogoUrlForSetCode("sv01", FIXTURE)).toBe(
      "https://assets.tcgdex.net/fr/sv/sv01/logo.png",
    );
    expect(tcgdexLogoUrlForSetCode("SV01", FIXTURE)).toBe(
      "https://assets.tcgdex.net/fr/sv/sv01/logo.png",
    );
    expect(tcgdexLogoUrlForSetCode("SVI", FIXTURE)).toBe(
      "https://assets.tcgdex.net/fr/sv/sv01/logo.png",
    );
    expect(tcgdexLogoUrlForSetCode("CRI", FIXTURE)).toBe(
      "https://assets.tcgdex.net/fr/me/me04/logo.png",
    );
  });

  it("falls back to the set symbol when there is no wordmark", () => {
    expect(tcgdexLogoUrlForSetCode("PGO", FIXTURE)).toBe(
      "https://assets.tcgdex.net/univ/swsh/pgo/symbol.png",
    );
  });

  it("stays empty on a missing code, a blank, or a colliding abbr", () => {
    expect(tcgdexLogoUrlForSetCode(null, FIXTURE)).toBeNull();
    expect(tcgdexLogoUrlForSetCode("   ", FIXTURE)).toBeNull();
    expect(tcgdexLogoUrlForSetCode("PRE", null)).toBeNull();
    expect(tcgdexLogoUrlForSetCode("ZZZ", FIXTURE)).toBeNull();
    expect(tcgdexLogoUrlForSetCode("CLASH", FIXTURE)).toBeNull();
  });
});

describe("tcgdexSetSymbolUrl", () => {
  it("prefers PokéCardex glyphes for the checklist (readable at 24px)", () => {
    expect(tcgdexSetSymbolUrl("sv08.5", FIXTURE)).toBe(
      "https://pokecardex.b-cdn.net/assets/images/symboles/PRE.png",
    );
    expect(tcgdexSetSymbolUrl("PRE", FIXTURE)).toBe(
      "https://pokecardex.b-cdn.net/assets/images/symboles/PRE.png",
    );
    expect(tcgdexSetSymbolUrl("sv01", FIXTURE)).toBe(
      "https://pokecardex.b-cdn.net/assets/images/symboles/SVI.png",
    );
  });

  it("lists PokéCardex then TCGdex so the UI can recover from abbr mismatch", () => {
    expect(tcgdexSetSymbolCandidates("sv08.5", FIXTURE)).toEqual([
      "https://pokecardex.b-cdn.net/assets/images/symboles/PRE.png",
      "https://assets.tcgdex.net/fr/sv/sv08.5/symbol.png",
      "https://assets.tcgdex.net/en/sv/sv08.5/symbol.png",
      "https://assets.tcgdex.net/fr/sv/sv01/logo.png",
      "https://assets.tcgdex.net/en/sv/sv01/logo.png",
      "https://assets.tcgdex.net/fr/sv/sv08.5/logo.png",
      "https://assets.tcgdex.net/en/sv/sv08.5/logo.png",
    ]);
    expect(tcgdexSetSymbolCandidates("neo1", {
      ...FIXTURE,
      sets: [
        {
          id: "neo1",
          name: "Neo Genesis",
          officialAbbr: "N1",
          localizedAbbr: "NGS",
          tcgOnline: null,
          logo: "https://assets.tcgdex.net/fr/neo/neo1/logo.png",
          symbol: "https://assets.tcgdex.net/univ/neo/neo1/symbol.png",
        },
      ],
    })).toEqual([
      "https://pokecardex.b-cdn.net/assets/images/symboles/N1.png",
      "https://pokecardex.b-cdn.net/assets/images/symboles/NGS.png",
      "https://assets.tcgdex.net/fr/neo/neo1/symbol.png",
      "https://assets.tcgdex.net/en/neo/neo1/symbol.png",
      "https://assets.tcgdex.net/fr/neo/neo1/logo.png",
      "https://assets.tcgdex.net/en/neo/neo1/logo.png",
    ]);
  });

  it("falls back to en TCGdex / era glyph / PROMO when set-specific files 404", () => {
    expect(
      tcgdexSetSymbolCandidates("basep", {
        ...FIXTURE,
        sets: [
          {
            id: "basep",
            name: "Wizards Black Star Promos",
            officialAbbr: null,
            localizedAbbr: null,
            tcgOnline: null,
            logo: null,
            symbol: "https://assets.tcgdex.net/univ/base/basep/symbol.png",
          },
        ],
      }),
    ).toEqual([
      "https://pokecardex.b-cdn.net/assets/images/symboles/WBP.png",
      "https://assets.tcgdex.net/fr/base/basep/symbol.png",
      "https://assets.tcgdex.net/en/base/basep/symbol.png",
      "https://pokecardex.b-cdn.net/assets/images/symboles/PROMO.png",
    ]);
    expect(
      tcgdexSetSymbolCandidates("tk-ex-latia", {
        ...FIXTURE,
        sets: [
          {
            id: "tk-ex-latia",
            name: "EX Kit dresseur (Latias)",
            officialAbbr: "TK1A",
            localizedAbbr: "KDA",
            tcgOnline: null,
            logo: null,
            symbol: "https://assets.tcgdex.net/univ/tk/tk-ex-latia/symbol.png",
          },
        ],
      }),
    ).toEqual([
      "https://pokecardex.b-cdn.net/assets/images/symboles/TK1-LA.png",
      "https://pokecardex.b-cdn.net/assets/images/symboles/TK1A.png",
      "https://pokecardex.b-cdn.net/assets/images/symboles/KDA.png",
      "https://assets.tcgdex.net/fr/tk/tk-ex-latia/symbol.png",
      "https://assets.tcgdex.net/en/tk/tk-ex-latia/symbol.png",
      "https://pokecardex.b-cdn.net/assets/images/symboles/EX.png",
    ]);
    expect(pokecardexFallbackGlyphCode("2013bw")).toBe("MC3");
    expect(pokecardexFallbackGlyphCode("2023sv")).toBe("M23");
  });

  it("synthesizes TCGdex URLs when the set is absent from the logo index (exu)", () => {
    expect(tcgdexSetSymbolCandidates("exu", FIXTURE)).toEqual([
      "https://pokecardex.b-cdn.net/assets/images/symboles/EX.png",
      "https://assets.tcgdex.net/fr/ex/exu/symbol.png",
      "https://assets.tcgdex.net/en/ex/exu/symbol.png",
    ]);
  });

  it("falls back to an era mate symbol for anniversary sets missing from the index", () => {
    const index: TcgdexSetLogoIndex = {
      ...FIXTURE,
      sets: [
        {
          id: "me01",
          name: "Méga-Évolution",
          officialAbbr: "MEG",
          localizedAbbr: null,
          tcgOnline: null,
          logo: "https://assets.tcgdex.net/fr/me/me01/logo.png",
          symbol: "https://assets.tcgdex.net/univ/me/me01/symbol.png",
        },
      ],
    };
    // CDN sert `/me/30th/…` (id API), pas `/me/me05.5/…`.
    expect(tcgdexSetSymbolCandidates("me05.5", index)).toEqual([
      "https://assets.tcgdex.net/fr/me/30th/symbol.png",
      "https://assets.tcgdex.net/en/me/30th/symbol.png",
      "https://assets.tcgdex.net/fr/me/me01/symbol.png",
      "https://assets.tcgdex.net/en/me/me01/symbol.png",
    ]);
    expect(tcgdexSetSymbolCandidates("me05.5c", index).slice(0, 4)).toEqual([
      "https://assets.tcgdex.net/fr/me/30th/symbol.png",
      "https://assets.tcgdex.net/en/me/30th/symbol.png",
      "https://assets.tcgdex.net/fr/me/30th-c/symbol.png",
      "https://assets.tcgdex.net/en/me/30th-c/symbol.png",
    ]);
  });

  it("resolves local me05.5 ↔ API 30th abbr for PokéCardex 30C", () => {
    const index: TcgdexSetLogoIndex = {
      ...FIXTURE,
      sets: [
        {
          id: "30th",
          name: "30ᵉ Anniversaire",
          officialAbbr: "30C",
          localizedAbbr: null,
          tcgOnline: null,
          logo: null,
          symbol: null,
        },
      ],
    };
    expect(tcgdexSetSymbolCandidates("me05.5", index)[0]).toBe(
      "https://pokecardex.b-cdn.net/assets/images/symboles/30C.png",
    );
  });

  it("strips PTCGO compound abbr and prefers parent gallery symbols", () => {
    const index: TcgdexSetLogoIndex = {
      ...FIXTURE,
      sets: [
        {
          id: "cel25",
          name: "Célébrations",
          officialAbbr: "CEL",
          localizedAbbr: "CEL",
          tcgOnline: null,
          logo: "https://assets.tcgdex.net/fr/swsh/cel25/logo.png",
          symbol: "https://assets.tcgdex.net/univ/swsh/cel25/symbol.png",
        },
        {
          id: "cel25cc",
          name: "Célébrations Classic Collection",
          officialAbbr: "CEL:CC",
          localizedAbbr: null,
          tcgOnline: null,
          logo: null,
          symbol: null,
        },
        {
          id: "swsh12.5",
          name: "Zénith Suprême",
          officialAbbr: "CRZ",
          localizedAbbr: "ZEN",
          tcgOnline: null,
          logo: null,
          symbol: "https://assets.tcgdex.net/univ/swsh/swsh12.5/symbol.png",
        },
        {
          id: "swsh12.5gg",
          name: "Galarian Gallery",
          officialAbbr: "CRZ:GG",
          localizedAbbr: null,
          tcgOnline: null,
          logo: null,
          symbol: null,
        },
      ],
    };
    expect(tcgdexSetSymbolCandidates("cel25cc", index)[0]).toBe(
      "https://pokecardex.b-cdn.net/assets/images/symboles/CEL.png",
    );
    expect(tcgdexSetSymbolCandidates("swsh12.5gg", index)[0]).toBe(
      "https://pokecardex.b-cdn.net/assets/images/symboles/CRZ.png",
    );
    expect(tcgdexSetSymbolCandidates("swsh12.5gg", index)).toContain(
      "https://assets.tcgdex.net/fr/swsh/swsh12.5/symbol.png",
    );
  });

  it("rewrites dead TCGdex /univ/ symbol URLs when no abbr", () => {
    const noAbbr: TcgdexSetLogoIndex = {
      ...FIXTURE,
      sets: [
        {
          id: "orphan",
          name: "Orphan",
          officialAbbr: null,
          localizedAbbr: null,
          tcgOnline: null,
          logo: null,
          symbol: "https://assets.tcgdex.net/univ/x/orphan/symbol.png",
        },
      ],
    };
    expect(tcgdexSetSymbolUrl("orphan", noAbbr)).toBe(
      "https://assets.tcgdex.net/fr/x/orphan/symbol.png",
    );
  });

  it("attaches iconUrl + iconUrls without clobbering an existing one", () => {
    const rows = withTcgdexSetSymbols(
      [
        { id: "sv01", label: "SV" },
        {
          id: "sv08.5",
          label: "PRE",
          iconUrl: "https://example.com/kept.png",
        },
      ],
      FIXTURE,
    );
    expect(rows[0]?.iconUrl).toBe(
      "https://pokecardex.b-cdn.net/assets/images/symboles/SVI.png",
    );
    expect(rows[0]?.iconUrls).toEqual([
      "https://pokecardex.b-cdn.net/assets/images/symboles/SVI.png",
      "https://assets.tcgdex.net/fr/sv/sv01/symbol.png",
      "https://assets.tcgdex.net/en/sv/sv01/symbol.png",
      "https://assets.tcgdex.net/fr/sv/sv08.5/symbol.png",
      "https://assets.tcgdex.net/en/sv/sv08.5/symbol.png",
      "https://assets.tcgdex.net/fr/sv/sv01/logo.png",
      "https://assets.tcgdex.net/en/sv/sv01/logo.png",
    ]);
    expect(rows[1]?.iconUrl).toBe("https://example.com/kept.png");
    expect(rows[1]?.iconUrls).toBeUndefined();
  });
});

describe("tcgdexWorkingSymbolUrl", () => {
  it("rewrites univ to a locale segment", () => {
    expect(
      tcgdexWorkingSymbolUrl(
        "https://assets.tcgdex.net/univ/ex/ex1/symbol.png",
      ),
    ).toBe("https://assets.tcgdex.net/fr/ex/ex1/symbol.png");
  });
});

describe("pokecardexSymbolUrl", () => {
  it("builds the CDN glyph URL from the official abbr", () => {
    expect(pokecardexSymbolUrl("pre")).toBe(
      "https://pokecardex.b-cdn.net/assets/images/symboles/PRE.png",
    );
    expect(pokecardexSymbolUrl("EX")).toBe(
      "https://pokecardex.b-cdn.net/assets/images/symboles/EX.png",
    );
    expect(pokecardexSymbolUrl("")).toBeNull();
    expect(pokecardexSymbolUrl("bad abbr")).toBeNull();
  });

  it("uses the stem before a PTCGO compound separator", () => {
    expect(pokecardexSymbolUrl("CEL:CC")).toBe(
      "https://pokecardex.b-cdn.net/assets/images/symboles/CEL.png",
    );
    expect(pokecardexSymbolUrl("CRZ:GG")).toBe(
      "https://pokecardex.b-cdn.net/assets/images/symboles/CRZ.png",
    );
  });
});

describe("tcgdexCatalogueSetIdForProduct", () => {
  it("maps shop abbr CRI to catalogue id me04", () => {
    expect(
      tcgdexCatalogueSetIdForProduct({ setCode: "CRI", index: FIXTURE }),
    ).toBe("me04");
  });
});

describe("tcgdexLogoUrlForProduct", () => {
  const catalog: TcgdexSetLogoIndex = {
    ...FIXTURE,
    sets: [
      ...FIXTURE.sets,
      {
        id: "sv04",
        name: "Faille Paradoxe",
        officialAbbr: "PAR",
      localizedAbbr: null,
        tcgOnline: null,
        logo: "https://assets.tcgdex.net/fr/sv/sv04/logo.png",
        symbol: null,
      },
      {
        id: "sv08",
        name: "Étincelles Déferlantes",
        officialAbbr: "SSP",
      localizedAbbr: null,
        tcgOnline: null,
        logo: "https://assets.tcgdex.net/fr/sv/sv08/logo.png",
        symbol: null,
      },
      {
        id: "sv02",
        name: "Évolutions à Paldea",
        officialAbbr: "PAL",
      localizedAbbr: null,
        tcgOnline: null,
        logo: "https://assets.tcgdex.net/fr/sv/sv02/logo.png",
        symbol: null,
      },
      {
        id: "xy12",
        name: "Évolutions",
        officialAbbr: "EVO",
      localizedAbbr: null,
        tcgOnline: null,
        logo: "https://assets.tcgdex.net/fr/xy/xy12/logo.png",
        symbol: null,
      },
      {
        id: "bw1",
        name: "Noir & Blanc",
        officialAbbr: "BLW",
      localizedAbbr: null,
        tcgOnline: null,
        logo: "https://assets.tcgdex.net/fr/bw/bw1/logo.png",
        symbol: null,
      },
      {
        id: "sv10.5b",
        name: "Foudre Noire",
        officialAbbr: "BLK",
      localizedAbbr: null,
        tcgOnline: null,
        logo: "https://assets.tcgdex.net/fr/sv/sv10.5b/logo.png",
        symbol: null,
      },
      {
        id: "sv10.5w",
        name: "Flamme Blanche",
        officialAbbr: "WHT",
      localizedAbbr: null,
        tcgOnline: null,
        logo: "https://assets.tcgdex.net/fr/sv/sv10.5w/logo.png",
        symbol: null,
      },
    ],
  };

  it("prefers setCode, then densest rightmost set name in the slug", () => {
    expect(
      tcgdexLogoUrlForProduct({ setCode: "PRE", index: catalog }),
    ).toContain("sv08.5");
    expect(
      tcgdexLogoUrlForProduct({
        slug: "boite-36-boosters-ecarlate-et-violet-etincelles-deferlantes",
        index: catalog,
      }),
    ).toContain("sv08");
    expect(
      tcgdexLogoUrlForProduct({
        slug: "boite-36-boosters-par-ecarlate-et-violet-faille-paradoxe",
        index: catalog,
      }),
    ).toContain("sv04");
    expect(
      tcgdexLogoUrlForProduct({
        slug: "pokebox-evolutions-de-paldea-miascarade-ex",
        name: "Pokébox Évolutions à Paldea - Miascarade EX",
        index: catalog,
      }),
    ).toContain("sv02");
    expect(
      tcgdexLogoUrlForProduct({
        slug: "boite-36-boosters-noir-et-blanc",
        index: catalog,
      }),
    ).toContain("bw1");
  });

  it("refuses a dual-set gift title instead of picking one side", () => {
    expect(
      tcgdexLogoUrlForProduct({
        slug: "foudre-noire-flamme-blanche-collection-poster",
        name: "Coffret Collection Poster EV10.5 Foudre Noire & Flamme Blanche",
        index: catalog,
      }),
    ).toBeNull();
  });
});

describe("refreshTcgdexSetLogoIndex", () => {
  let dir: string;
  let dest: string;

  beforeEach(() => {
    httpGet.mockReset();
    __resetTcgdexSetLogoIndexForTests();
    __seedDigitalOnlyCacheForTests(["a2"]);
    dir = mkdtempSync(path.join(os.tmpdir(), "tcgdex-logos-"));
    dest = path.join(dir, "tcgdex-set-logos.json");
  });

  afterEach(() => {
    __resetDigitalOnlyCacheForTests();
    __resetTcgdexSetLogoIndexForTests();
    rmSync(dir, { recursive: true, force: true });
  });

  it("joins list logos to detail abbreviations and skips Pocket sets", async () => {
    httpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/fr/sets")) {
        return {
          data: [
            {
              id: "me04",
              name: "Aventures Ensemble",
              logo: "https://assets.tcgdex.net/fr/me/me04/logo",
              symbol: "https://assets.tcgdex.net/univ/me/me04/symbol",
            },
            {
              id: "a2",
              name: "Pocket",
              logo: "https://assets.tcgdex.net/en/tcgp/a2/logo",
            },
            { id: "empty", name: "No art" },
            {
              id: "base1",
              name: "Set de Base",
              // Pas de logo/symbole sur la liste — l'abbr vient du détail.
            },
          ],
        };
      }
      if (url.endsWith("/fr/sets/me04")) {
        return {
          data: {
            id: "me04",
            name: "Aventures Ensemble",
            logo: "https://assets.tcgdex.net/fr/me/me04/logo",
            symbol: "https://assets.tcgdex.net/univ/me/me04/symbol",
            abbreviation: { official: "CRI", tcgOnline: "CRI" },
          },
        };
      }
      if (url.endsWith("/fr/sets/empty")) {
        return { data: { id: "empty", name: "No art" } };
      }
      if (url.endsWith("/fr/sets/base1")) {
        return {
          data: {
            id: "base1",
            name: "Set de Base",
            abbreviation: { official: "BS", localized: "BAS" },
          },
        };
      }
      throw new Error(`unexpected GET ${url}`);
    });

    const index = await refreshTcgdexSetLogoIndex({ dest, force: true });
    expect(index.sets).toEqual([
      {
        id: "me04",
        name: "Aventures Ensemble",
        officialAbbr: "CRI",
        localizedAbbr: null,
        tcgOnline: "CRI",
        logo: "https://assets.tcgdex.net/fr/me/me04/logo.png",
        symbol: "https://assets.tcgdex.net/univ/me/me04/symbol.png",
      },
      {
        id: "base1",
        name: "Set de Base",
        officialAbbr: "BS",
        localizedAbbr: "BAS",
        tcgOnline: null,
        logo: null,
        symbol: null,
      },
    ]);
    const urls = httpGet.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.endsWith("/fr/sets/a2"))).toBe(false);
    expect(urls.some((url) => url.endsWith("/fr/sets/base1"))).toBe(true);

    const onDisk = JSON.parse(readFileSync(dest, "utf8")) as TcgdexSetLogoIndex;
    expect(onDisk.sets).toHaveLength(2);

    httpGet.mockClear();
    __resetTcgdexSetLogoIndexForTests();
    const reused = await refreshTcgdexSetLogoIndex({ dest });
    expect(reused.sets[0]?.officialAbbr).toBe("CRI");
    expect(httpGet).not.toHaveBeenCalled();
  });
});
