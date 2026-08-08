import { describe, expect, it } from "vitest";

import {
  extraLiveFragStems,
  kebabCssStemToCamelId,
  liveLeavesMissingCssMap,
  liveLeavesMissingSharedMotifs,
  simeyCssGaps,
} from "./gapMaps";

describe("gapMaps", () => {
  it("kebabCssStemToCamelId matches Placarr look ids", () => {
    expect(kebabCssStemToCamelId("radiant-holo")).toBe("radiantHolo");
    expect(kebabCssStemToCamelId("v-full-art")).toBe("vFullArt");
    expect(kebabCssStemToCamelId("rainbow-alt")).toBe("rainbowAlt");
  });

  it("simeyCssGaps skips scaffolding and reports unported rarities", () => {
    const gaps = simeyCssGaps({
      files: [
        { tree: "css", stem: "base" },
        { tree: "css", stem: "radiant-holo" },
        { tree: "151", stem: "brand-new-rare" },
      ],
      portedIds: new Set(["radiantHolo", "radiantHoloCoat"]),
    });
    expect(gaps).toEqual([
      { tree: "151", stem: "brand-new-rare", expectedId: "brandNewRare" },
    ]);
  });

  it("liveLeavesMissingCssMap ignores NonFoil and finds holes", () => {
    expect(
      liveLeavesMissingCssMap({
        foilNames: ["RadiantHolo", "NonFoil", "SunBeam"],
        sheetAliases: ["FlatSilver_CC"],
        liveFinishCss: { RadiantHolo: "radiantHolo" },
      }),
    ).toEqual(["FlatSilver_CC", "SunBeam"]);
  });

  it("liveLeavesMissingSharedMotifs and extraLiveFragStems", () => {
    expect(
      liveLeavesMissingSharedMotifs({
        foilNames: ["RadiantHolo", "NonFoil"],
        sheetAliases: [],
        hasShared: (n) => n === "RadiantHolo",
      }),
    ).toEqual([]);
    expect(extraLiveFragStems(["RadiantHolo", "NewLeaf"], ["RadiantHolo"])).toEqual(
      ["NewLeaf"],
    );
  });
});
