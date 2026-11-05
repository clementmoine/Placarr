import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  backfillTcgdexMissingImageBasesFromCdn,
  fillMissingImageBasesFromCdnProbe,
} from "./backfillCdnImageBases";
import {
  lookupTcgdexSearchRow,
  patchTcgdexPrintImageBases,
  resetTcgdexIndexCache,
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

function tmpPokemonData(): string {
  const dataRoot = mkdtempSync(path.join(os.tmpdir(), "placarr-cdn-backfill-"));
  roots.push(dataRoot);
  vi.stubEnv("PLACARR_DATA_DIR", dataRoot);
  return dataRoot;
}

describe("fillMissingImageBasesFromCdnProbe", () => {
  it("fills empty bases when CDN HEAD succeeds", async () => {
    const prints = [
      { localId: "001", imageBaseUrl: null as string | null },
      { localId: "002", imageBaseUrl: null as string | null },
      {
        localId: "003",
        imageBaseUrl: "https://assets.tcgdex.net/ja/S/S8b/003",
      },
    ];
    const filled = await fillMissingImageBasesFromCdnProbe({
      lang: "ja",
      serieId: "S",
      remoteSetId: "S8b",
      prints,
      headOk: async (url) => url.includes("/S8b/001/high.webp"),
    });
    expect(filled).toBe(2);
    expect(prints[0]!.imageBaseUrl).toBe(
      "https://assets.tcgdex.net/ja/S/S8b/001",
    );
    expect(prints[1]!.imageBaseUrl).toBe(
      "https://assets.tcgdex.net/ja/S/S8b/002",
    );
    expect(prints[2]!.imageBaseUrl).toBe(
      "https://assets.tcgdex.net/ja/S/S8b/003",
    );
  });

  it("leaves empties when CDN is absent", async () => {
    const prints = [{ localId: "001", imageBaseUrl: null as string | null }];
    const filled = await fillMissingImageBasesFromCdnProbe({
      lang: "ja",
      serieId: "BW",
      remoteSetId: "BW8a",
      prints,
      headOk: async () => false,
    });
    expect(filled).toBe(0);
    expect(prints[0]!.imageBaseUrl).toBeNull();
  });
});

describe("backfillTcgdexMissingImageBasesFromCdn", () => {
  it("patches sqlite when set CDN probe hits", async () => {
    tmpPokemonData();
    writeTcgdexSet({
      set: {
        setId: "s8b",
        lang: "ja",
        name: "VMAXクライマックス",
        serieName: "剣と盾",
        releasedAt: "2021-12-03",
        totalCount: 2,
        officialCount: 2,
      },
      prints: [
        {
          printKey: "pokemon:s8b-001",
          setId: "s8b",
          localId: "001",
          providerId: "S8b-001",
          imageBaseUrl: null,
        },
        {
          printKey: "pokemon:s8b-002",
          setId: "s8b",
          localId: "002",
          providerId: "S8b-002",
          imageBaseUrl: null,
        },
      ],
      titles: [
        {
          printKey: "pokemon:s8b-001",
          lang: "ja",
          name: "ビードル",
          setName: "VMAXクライマックス",
          serieName: "剣と盾",
        },
        {
          printKey: "pokemon:s8b-002",
          lang: "ja",
          name: "コクーン",
          setName: "VMAXクライマックス",
          serieName: "剣と盾",
        },
      ],
    });

    const report = await backfillTcgdexMissingImageBasesFromCdn({
      delayMs: 0,
      fetchSet: async () => ({ id: "S8b", serie: { id: "S" } }),
      headOk: async (url) => url.includes("/ja/S/S8b/001/high.webp"),
    });

    expect(report.setsWithCdn).toBe(1);
    expect(report.printsPatched).toBe(2);
    expect(
      lookupTcgdexSearchRow("pokemon:s8b-001", { language: "ja" })
        ?.imageBaseUrl,
    ).toBe("https://assets.tcgdex.net/ja/S/S8b/001");
  });
});

describe("patchTcgdexPrintImageBases", () => {
  it("does not overwrite an existing CDN base", () => {
    tmpPokemonData();
    writeTcgdexSet({
      set: {
        setId: "s10a",
        lang: "ja",
        name: "ダークファンタズマ",
        serieName: null,
        releasedAt: null,
        totalCount: 1,
        officialCount: 1,
      },
      prints: [
        {
          printKey: "pokemon:s10a-001",
          setId: "s10a",
          localId: "001",
          providerId: "S10a-001",
          imageBaseUrl: "https://assets.tcgdex.net/ja/S/S10a/001",
        },
      ],
      titles: [
        {
          printKey: "pokemon:s10a-001",
          lang: "ja",
          name: "ニャース",
          setName: "ダークファンタズマ",
          serieName: null,
        },
      ],
    });
    const written = patchTcgdexPrintImageBases([
      {
        printKey: "pokemon:s10a-001",
        imageBaseUrl: "https://assets.tcgdex.net/ja/S/OTHER/001",
      },
    ]);
    expect(written).toBe(0);
    expect(
      lookupTcgdexSearchRow("pokemon:s10a-001", { language: "ja" })
        ?.imageBaseUrl,
    ).toBe("https://assets.tcgdex.net/ja/S/S10a/001");
  });
});
