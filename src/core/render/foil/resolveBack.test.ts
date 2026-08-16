import { afterEach, describe, expect, it } from "vitest";

import {
  pickDefaultCardBack,
  rankCardBacks,
  resolveCardBackCandidates,
  sharedCardBackSkeletonUrl,
  type CardBackCandidate,
} from "./cardBacks";
import { __resetEffectPacksForTests, registerEffectPack } from "./registry";
import { resolveCardBackUrl, resolveDefaultCardBack } from "./resolveBack";
import type { EffectPackModule } from "./types";

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
