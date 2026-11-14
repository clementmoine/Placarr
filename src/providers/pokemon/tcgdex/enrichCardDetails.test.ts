import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const httpGet = vi.fn();
vi.mock("@/lib/http/httpClient", () => ({
  httpGet: (...args: unknown[]) => httpGet(...args),
}));

import { enrichTcgdexCardDetails } from "./enrichCardDetails";
import {
  lookupTcgdexSearchRow,
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
  httpGet.mockReset();
});

function tmpPokemonData(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "placarr-tcgdex-enrich-"));
  roots.push(root);
  vi.stubEnv("PLACARR_DATA_DIR", root);
  return root;
}

describe("enrichTcgdexCardDetails", () => {
  it("fills rarity/stage from per-card detail without wiping names", async () => {
    tmpPokemonData();
    writeTcgdexSet({
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

    expect(
      lookupTcgdexSearchRow("pokemon:swsh3-1", { language: "fr" })?.rarity,
    ).toBeNull();

    httpGet.mockResolvedValueOnce({
      data: { rarity: "Holo Rare V", stage: "Base" },
    });

    const result = await enrichTcgdexCardDetails({ limit: 10, delayMs: 0 });
    expect(result).toEqual({ attempted: 1, patched: 1, failed: 0 });
    expect(httpGet).toHaveBeenCalledWith(
      "https://api.tcgdex.net/v2/fr/cards/swsh3-1",
      expect.objectContaining({ timeout: 20_000 }),
    );

    const row = lookupTcgdexSearchRow("pokemon:swsh3-1", { language: "fr" });
    expect(row?.name).toBe("Papilusion V");
    expect(row?.rarity).toBe("Holo Rare V");
    expect(row?.stage).toBe("Base");
  });

  it("keeps prior rarity when set re-harvest omits detail fields", () => {
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
          imageBaseUrl: null,
        },
      ],
      titles: [
        {
          printKey: "pokemon:swsh3-1",
          lang: "fr",
          name: "Papilusion V",
          setName: "Ténèbres Embrasées",
          serieName: null,
          rarity: "Holo Rare V",
          stage: "Base",
        },
      ],
    });
    writeTcgdexSet({
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
          imageBaseUrl: null,
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
    const row = lookupTcgdexSearchRow("pokemon:swsh3-1", { language: "fr" });
    expect(row?.rarity).toBe("Holo Rare V");
    expect(row?.stage).toBe("Base");
    expect(row?.serieName).toBe("Épée et Bouclier");
  });
});
