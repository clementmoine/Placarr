import { describe, expect, it } from "vitest";

import {
  extraLiveFragStems,
  kebabCssStemToCamelId,
  liveLeavesMissingCssMap,
  liveLeavesMissingSharedMotifs,
  lorcanaCatalogueCssGaps,
  lorcanaWebStemGaps,
  simeyCssGaps,
} from "@/lib/admin/foilGapMaps";

describe("foilGapMaps", () => {
  it("kebabCssStemToCamelId", () => {
    expect(kebabCssStemToCamelId("radiant-holo")).toBe("radiantHolo");
  });

  it("extraLiveFragStems", () => {
    expect(extraLiveFragStems(["A", "B"], ["A"])).toEqual(["B"]);
  });

  it("liveLeavesMissingSharedMotifs", () => {
    expect(
      liveLeavesMissingSharedMotifs({
        foilNames: ["A", "NonFoil"],
        sheetAliases: [],
        hasShared: (n) => n === "A",
      }),
    ).toEqual([]);
  });

  it("liveLeavesMissingCssMap", () => {
    expect(
      liveLeavesMissingCssMap({
        foilNames: ["RadiantHolo", "NonFoil"],
        sheetAliases: [],
        liveFinishCss: { RadiantHolo: "radiantHolo" },
      }),
    ).toEqual([]);
  });

  it("simeyCssGaps", () => {
    const gaps = simeyCssGaps({
      files: [{ tree: "poke-holo", stem: "radiant-holo" }],
      portedIds: new Set(["radiantHolo"]),
    });
    expect(gaps).toEqual([]);
  });

  it("lorcanaCatalogueCssGaps", () => {
    expect(
      lorcanaCatalogueCssGaps({
        finishes: ["Silver", "Kaleidoscope"],
        varnishes: ["HighGloss", "MysteryCoat"],
        isFinishFallbackOnly: (f) => f === "Kaleidoscope",
        isVarnishFallbackOnly: (v) => v === "MysteryCoat",
      }),
    ).toEqual({
      finishes: ["Kaleidoscope"],
      varnishes: ["MysteryCoat"],
    });
  });

  it("lorcanaWebStemGaps skips chrome", () => {
    expect(
      lorcanaWebStemGaps({ unlistedStems: ["frame", "menu", "newfoil"] }),
    ).toEqual(["newfoil"]);
  });
});
