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
  refreshTcgdexSetLogoIndex,
  tcgdexLogoUrlForSetCode,
  tcgdexSetAssetUrl,
  type TcgdexSetLogoIndex,
} from "./setLogos";

const FIXTURE: TcgdexSetLogoIndex = {
  version: 1,
  language: "fr",
  fetchedAt: "2026-08-16T00:00:00.000Z",
  sets: [
    {
      id: "sv08.5",
      name: "Évolutions Prismatiques",
      officialAbbr: "PRE",
      tcgOnline: "PRE",
      logo: "https://assets.tcgdex.net/fr/sv/sv08.5/logo.png",
      symbol: "https://assets.tcgdex.net/univ/sv/sv08.5/symbol.png",
    },
    {
      id: "sv01",
      name: "Écarlate et Violet",
      officialAbbr: "SVI",
      tcgOnline: "SVI",
      logo: "https://assets.tcgdex.net/fr/sv/sv01/logo.png",
      symbol: null,
    },
    {
      id: "me04",
      name: "Aventures Ensemble",
      officialAbbr: "CRI",
      tcgOnline: null,
      logo: "https://assets.tcgdex.net/fr/me/me04/logo.png",
      symbol: null,
    },
    {
      id: "pgo",
      name: "Pokémon GO",
      officialAbbr: "PGO",
      tcgOnline: null,
      logo: null,
      symbol: "https://assets.tcgdex.net/univ/swsh/pgo/symbol.png",
    },
    {
      id: "dup-a",
      name: "Collision",
      officialAbbr: "CLASH",
      tcgOnline: null,
      logo: "https://example.test/a.png",
      symbol: null,
    },
    {
      id: "dup-b",
      name: "Collision bis",
      officialAbbr: "CLASH",
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
      throw new Error(`unexpected GET ${url}`);
    });

    const index = await refreshTcgdexSetLogoIndex({ dest, force: true });
    expect(index.sets).toEqual([
      {
        id: "me04",
        name: "Aventures Ensemble",
        officialAbbr: "CRI",
        tcgOnline: "CRI",
        logo: "https://assets.tcgdex.net/fr/me/me04/logo.png",
        symbol: "https://assets.tcgdex.net/univ/me/me04/symbol.png",
      },
    ]);
    const urls = httpGet.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.endsWith("/fr/sets/a2"))).toBe(false);

    const onDisk = JSON.parse(readFileSync(dest, "utf8")) as TcgdexSetLogoIndex;
    expect(onDisk.sets).toHaveLength(1);

    httpGet.mockClear();
    __resetTcgdexSetLogoIndexForTests();
    const reused = await refreshTcgdexSetLogoIndex({ dest });
    expect(reused.sets[0]?.officialAbbr).toBe("CRI");
    expect(httpGet).not.toHaveBeenCalled();
  });
});
