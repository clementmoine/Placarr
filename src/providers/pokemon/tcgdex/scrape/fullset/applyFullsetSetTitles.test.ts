import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  lookupTcgdexSearchRow,
  resetTcgdexIndexCache,
  writeTcgdexSet,
} from "../../indexStore";
import { __seedTcgdexSetLogoIndexForTests } from "../../setLogos";
import { applyFullsetPokemonSetTitles } from "./applyFullsetSetTitles";
import type { FullsetPokemonSetsLedger } from "./parseFullsetSets";

const roots: string[] = [];
afterEach(() => {
  resetTcgdexIndexCache();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

function tmpPokemonData(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "placarr-fullset-apply-"));
  roots.push(root);
  vi.stubEnv("PLACARR_DATA_DIR", root);
  return root;
}

describe("applyFullsetPokemonSetTitles", () => {
  it("overlays FR set titles matched by EN name and abbr", () => {
    const root = tmpPokemonData();
    writeTcgdexSet({
      set: {
        setId: "swsh1",
        lang: "en",
        name: "Sword & Shield",
        serieName: "Sword & Shield",
        releasedAt: "2020-02-07",
        totalCount: 1,
        officialCount: 1,
      },
      prints: [],
      titles: [],
    });
    writeTcgdexSet({
      set: {
        setId: "swsh1",
        lang: "fr",
        name: "Épée et Bouclier",
        serieName: "Épée et Bouclier",
        releasedAt: "2020-02-07",
        totalCount: 1,
        officialCount: 1,
      },
      prints: [
        {
          printKey: "pokemon:swsh1-1",
          setId: "swsh1",
          localId: "1",
          providerId: "swsh1-1",
          imageBaseUrl: null,
        },
      ],
      titles: [
        {
          printKey: "pokemon:swsh1-1",
          lang: "fr",
          name: "Pikachu",
          setName: "Épée et Bouclier",
          serieName: "Épée et Bouclier",
        },
      ],
    });
    writeTcgdexSet({
      set: {
        setId: "mew",
        lang: "en",
        name: "151",
        serieName: "Scarlet & Violet",
        releasedAt: "2023-09-22",
        totalCount: 1,
        officialCount: 1,
      },
      prints: [],
      titles: [],
    });
    writeTcgdexSet({
      set: {
        setId: "mew",
        lang: "fr",
        name: "151",
        serieName: "Écarlate et Violet",
        releasedAt: "2023-09-22",
        totalCount: 1,
        officialCount: 1,
      },
      prints: [],
      titles: [],
    });

    __seedTcgdexSetLogoIndexForTests({
      version: 2,
      language: "fr",
      fetchedAt: new Date().toISOString(),
      sets: [
        {
          id: "mew",
          name: "151",
          officialAbbr: "MEW",
          localizedAbbr: "MEW",
          tcgOnline: null,
          logo: null,
          symbol: null,
        },
      ],
    });

    const ledger: FullsetPokemonSetsLedger = {
      source: "https://fullset.fr/pokemon/sets",
      observed: "2026-10-28T00:00:00.000Z",
      sets: [
        {
          fullsetId: "1",
          nameFr: "Epée & Bouclier",
          nameEn: "Sword & Shield",
          ref: "SSH",
          releasedAt: "2020-02-07",
          path: null,
          iconPath: null,
          imagePath: null,
          setType: "1",
        },
        {
          fullsetId: "2",
          nameFr: "151 Fullset",
          nameEn: "Something Unmatched",
          ref: "MEW",
          releasedAt: null,
          path: null,
          iconPath: null,
          imagePath: null,
          setType: null,
        },
        {
          fullsetId: "3",
          nameFr: "Orphelin",
          nameEn: "No Match Anywhere",
          ref: "ZZZ",
          releasedAt: null,
          path: null,
          iconPath: null,
          imagePath: null,
          setType: null,
        },
      ],
    };

    const ledgerPath = path.join(root, "sources", "fullset-sets.json");
    mkdirSync(path.dirname(ledgerPath), { recursive: true });
    writeFileSync(ledgerPath, `${JSON.stringify(ledger)}\n`);

    const result = applyFullsetPokemonSetTitles({ ledgerPath });
    expect(result.matched).toBe(2);
    expect(result.updated).toBe(2);
    expect(result.unmatched).toBe(1);

    expect(
      lookupTcgdexSearchRow("pokemon:swsh1-1", { language: "fr" })?.setName,
    ).toBe("Epée & Bouclier");
  });
});
