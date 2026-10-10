import { afterEach, describe, expect, it } from "vitest";

import {
  __resetEffectPacksForTests,
  applyHouseFoilFallback,
  hotFoilStampUniforms,
  HOUSE_FOIL_FALLBACK_CSS_ID,
  pickDefaultCardBack,
  rankCardBacks,
  registerEffectPack,
  resolveCardBackCandidates,
  resolveCardBackUrl,
  resolveDefaultCardBack,
  resolveSharedCardBackSkeleton,
  selectFoilBackend,
  sharedCardBackSkeletonUrl,
  type CardBackCandidate,
} from "./backend";
import type { EffectPackModule, FoilMaterial } from "./types";

function colors(entries: FoilMaterial["colors"]): Pick<FoilMaterial, "colors"> {
  return { colors: entries };
}

function fakePack(
  overrides: Partial<EffectPackModule> &
    Pick<EffectPackModule, "id" | "cardBackUrl">,
): EffectPackModule {
  return {
    assetBase: "/assets/test",
    resolveMaterial: () => null,
    resolveMaterialForPrint: () => null,
    resolveCss: () => ({ finishShaderId: null, varnishShaderId: null }),
    listMaterials: () => [],
    material: () => null,
    ...overrides,
  };
}

describe("hotFoilStampUniforms", () => {
  it("routes Metallic-style stamps to _HotFoilColor only", () => {
    expect(
      hotFoilStampUniforms(
        colors({
          _HotFoilColor: [0.2, 0.4, 0.2, 1],
          _VarnishLightColor: [0.8, 0.6, 0.4, 1],
        }),
      ),
    ).toEqual(new Set(["_HotFoilColor"]));
  });

  it("routes Snow-style stamps to _VarnishLightColor (HotFoilColor compiled out)", () => {
    expect(
      hotFoilStampUniforms(
        colors({
          _VarnishLightColor: [0.86, 0.94, 0.95, 1],
        }),
      ),
    ).toEqual(new Set(["_VarnishLightColor"]));
  });
});

describe("selectFoilBackend", () => {
  const ready = {
    supportsWebgl2: true,
    hasMaterial: true,
    hasPoolSlot: true,
  };

  it("always picks css when preference is css", () => {
    expect(selectFoilBackend({ preference: "css", ...ready })).toBe("css");
    expect(
      selectFoilBackend({
        preference: "css",
        supportsWebgl2: false,
        hasMaterial: false,
        hasPoolSlot: false,
      }),
    ).toBe("css");
  });

  it("picks webgl when preference is webgl and requirements are met", () => {
    expect(selectFoilBackend({ preference: "webgl", ...ready })).toBe("webgl");
  });

  it("falls back to css when webgl preference cannot be satisfied", () => {
    expect(
      selectFoilBackend({
        preference: "webgl",
        supportsWebgl2: false,
        hasMaterial: true,
        hasPoolSlot: true,
      }),
    ).toBe("css");
    expect(
      selectFoilBackend({
        preference: "webgl",
        supportsWebgl2: true,
        hasMaterial: false,
        hasPoolSlot: true,
      }),
    ).toBe("css");
    expect(
      selectFoilBackend({
        preference: "webgl",
        supportsWebgl2: true,
        hasMaterial: true,
        hasPoolSlot: false,
      }),
    ).toBe("css");
  });

  it("auto behaves like webgl preference", () => {
    expect(selectFoilBackend({ preference: "auto", ...ready })).toBe("webgl");
    expect(
      selectFoilBackend({
        preference: "auto",
        supportsWebgl2: true,
        hasMaterial: true,
        hasPoolSlot: false,
      }),
    ).toBe("css");
  });
});

describe("applyHouseFoilFallback", () => {
  it("keeps a dedicated look", () => {
    expect(applyHouseFoilFallback("rainbowFoil", "Rainbow")).toBe(
      "rainbowFoil",
    );
    expect(applyHouseFoilFallback("silver", "Silver")).toBe("silver");
  });

  it("falls back to house flare when shiny but no look", () => {
    expect(applyHouseFoilFallback(null, "holo")).toBe(
      HOUSE_FOIL_FALLBACK_CSS_ID,
    );
    expect(applyHouseFoilFallback("", "SomeFutureLeaf")).toBe("flare");
  });

  it("stays flat for empty / None", () => {
    expect(applyHouseFoilFallback(null, null)).toBeNull();
    expect(applyHouseFoilFallback(null, "")).toBeNull();
    expect(applyHouseFoilFallback(null, "None")).toBeNull();
  });
});

describe("rankCardBacks", () => {
  it("orders print > set > pack", () => {
    const ranked = rankCardBacks([
      { url: "/pack.png", scope: "pack" },
      { url: "/print.png", scope: "print" },
      { url: "/set.png", scope: "set" },
    ]);
    expect(ranked.map((c) => c.scope)).toEqual(["print", "set", "pack"]);
  });
});

describe("pickDefaultCardBack", () => {
  it("returns null for an empty list", () => {
    expect(pickDefaultCardBack([])).toBeNull();
  });

  it("picks the print candidate when present", () => {
    const pick = pickDefaultCardBack([
      { url: "/pack.png", scope: "pack" },
      { url: "/alt.png", scope: "print", key: "dbs-leader" },
    ]);
    expect(pick?.url).toBe("/alt.png");
  });
});

describe("sharedCardBackSkeletonUrl", () => {
  it("allows pack and set backs as shared skeletons", () => {
    expect(sharedCardBackSkeletonUrl({ url: "/pack.png", scope: "pack" })).toBe(
      "/pack.png",
    );
    expect(sharedCardBackSkeletonUrl({ url: "/set.png", scope: "set" })).toBe(
      "/set.png",
    );
  });

  it("refuses print-scoped alt faces", () => {
    expect(
      sharedCardBackSkeletonUrl({ url: "/alt.png", scope: "print" }),
    ).toBeNull();
  });
});

describe("resolveSharedCardBackSkeleton", () => {
  afterEach(() => {
    __resetEffectPacksForTests();
  });

  it("still shows the pack back when a print alt face is the flip default", () => {
    registerEffectPack(
      fakePack({
        id: "pack-a",
        cardBackUrl: "/pack.png",
      }),
    );
    expect(
      resolveSharedCardBackSkeleton({
        printCardBackUrl: "/print-alt.png",
        effectPackId: "pack-a",
      }),
    ).toBe("/pack.png");
    expect(
      resolveDefaultCardBack({
        printCardBackUrl: "/print-alt.png",
        effectPackId: "pack-a",
      })?.scope,
    ).toBe("print");
  });
});

describe("resolveCardBackCandidates / resolveCardBackUrl", () => {
  afterEach(() => {
    __resetEffectPacksForTests();
  });

  it("stacks print, set resolve, and pack default", () => {
    registerEffectPack(
      fakePack({
        id: "pack-a",
        cardBackUrl: "/assets/pack-a/cards/back.png",
        resolveCardBack: ({ setCode }) =>
          setCode === "S1" ? "/assets/pack-a/set_s1.png" : null,
      }),
    );
    const candidates = resolveCardBackCandidates({
      printCardBackUrl: "/uploads/leader_back.png",
      printKey: "game-s1-1",
      setCode: "S1",
      effectPackId: "pack-a",
      providerId: "example",
    });
    expect(candidates).toEqual<CardBackCandidate[]>([
      {
        url: "/uploads/leader_back.png",
        scope: "print",
        key: "game-s1-1",
        source: "example",
      },
      {
        url: "/assets/pack-a/set_s1.png",
        scope: "set",
        key: "S1",
        source: "effect-pack",
      },
      {
        url: "/assets/pack-a/cards/back.png",
        scope: "pack",
        source: "effect-pack",
      },
    ]);
    expect(
      resolveCardBackUrl({
        printCardBackUrl: "/uploads/leader_back.png",
        setCode: "S1",
        effectPackId: "pack-a",
      }),
    ).toBe("/uploads/leader_back.png");
  });

  it("falls through to pack default when only the pack is known", () => {
    registerEffectPack(
      fakePack({ id: "pack-a", cardBackUrl: "/assets/pack-a/cards/back.png" }),
    );
    expect(resolveCardBackUrl({ effectPackId: "pack-a" })).toBe(
      "/assets/pack-a/cards/back.png",
    );
    expect(resolveDefaultCardBack({ effectPackId: "pack-a" })?.scope).toBe(
      "pack",
    );
  });

  it("returns null when the pack is unknown", () => {
    expect(resolveCardBackUrl({ effectPackId: "unknown" })).toBeNull();
    expect(resolveCardBackUrl({})).toBeNull();
  });

  it("ignores blank print URLs", () => {
    registerEffectPack(
      fakePack({ id: "pack-a", cardBackUrl: "/assets/pack-a/cards/back.png" }),
    );
    expect(
      resolveCardBackUrl({
        printCardBackUrl: "   ",
        effectPackId: "pack-a",
      }),
    ).toBe("/assets/pack-a/cards/back.png");
  });
});
