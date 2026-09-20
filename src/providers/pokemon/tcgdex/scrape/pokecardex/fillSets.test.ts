import { describe, expect, it } from "vitest";
import { mkdtempSync, existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  fillPokecardexFacesForSet,
  listPokecardexRetailFillTargets,
  pokecardexSeriesCodeForSet,
} from "./fillSets";

describe("pokecardexSeriesCodeForSet", () => {
  it("uses curated aliases for POP / Wizards promos", () => {
    expect(pokecardexSeriesCodeForSet("pop1")).toBe("POP1");
    expect(pokecardexSeriesCodeForSet("basep")).toBe("WBP");
  });

  it("uses hyphenated PokéCardex codes for trainer kits", () => {
    expect(pokecardexSeriesCodeForSet("tk-ex-latia")).toBe("TK1-LA");
    expect(pokecardexSeriesCodeForSet("tk-ex-latio")).toBe("TK1-LO");
    expect(pokecardexSeriesCodeForSet("tk-xy-n")).toBe("TK6-B");
  });

  it("does not guess kit codes from TCGdex abbr (TK4R ≠ TK4-R)", () => {
    expect(pokecardexSeriesCodeForSet("tk-hs-r")).toBeNull();
  });

  it("reads officialAbbr from the logo index for DP", () => {
    expect(pokecardexSeriesCodeForSet("dp1")).toBe("DP");
    expect(pokecardexSeriesCodeForSet("dp2")).toBe("MT");
  });
});

describe("fillPokecardexFacesForSet", () => {
  it("writes art.pokecardex.jpg from the scan CDN", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "poke-pcdx-set-"));
    const report = await fillPokecardexFacesForSet({
      setId: "dp1",
      localIds: ["1"],
      lang: "fr",
      seriesCode: "DP",
      cardsRoot: root,
      downloadImage: async () => Buffer.alloc(800, 1),
    });
    expect(report.written).toBe(1);
    expect(
      existsSync(path.join(root, "dp1", "fr", "001", "art.pokecardex.jpg")),
    ).toBe(true);
  });
});

describe("listPokecardexRetailFillTargets", () => {
  it("skips McDo year-sets (handled by fillMcdo)", () => {
    const ids = listPokecardexRetailFillTargets({ language: "fr" }).map(
      (t) => t.setId,
    );
    expect(ids.some((id) => /^\d{4}/.test(id))).toBe(false);
    expect(ids).toContain("tk-ex-latia");
  });
});
