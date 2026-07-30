import { afterEach, describe, expect, it } from "vitest";

import {
  __resetEffectPacksForTests,
  registerEffectPack,
} from "./registry";
import { resolveCardBackUrl } from "./resolveBack";
import type { EffectPackModule } from "./types";

function fakePack(
  overrides: Partial<EffectPackModule> & Pick<EffectPackModule, "id">,
): EffectPackModule {
  return {
    assetBase: "/foil/test",
    cardBackUrl: null,
    resolveMaterial: () => null,
    resolveMaterialForPrint: () => null,
    resolveCss: () => ({ finishShaderId: null, varnishShaderId: null }),
    listMaterials: () => [],
    material: () => null,
    ...overrides,
  };
}

describe("resolveCardBackUrl", () => {
  afterEach(() => {
    __resetEffectPacksForTests();
  });

  it("prefers the shelf card back when set", () => {
    registerEffectPack(
      fakePack({ id: "pack-a", cardBackUrl: "/foil/pack-a/back.png" }),
    );
    expect(
      resolveCardBackUrl({
        shelfCardBackUrl: "/shelf/back.png",
        effectPackId: "pack-a",
      }),
    ).toBe("/shelf/back.png");
  });

  it("falls back to the effect pack card back", () => {
    registerEffectPack(
      fakePack({ id: "pack-a", cardBackUrl: "/foil/pack-a/back.png" }),
    );
    expect(
      resolveCardBackUrl({ effectPackId: "pack-a" }),
    ).toBe("/foil/pack-a/back.png");
  });

  it("returns null when neither shelf nor pack provides a back", () => {
    registerEffectPack(fakePack({ id: "pack-a", cardBackUrl: null }));
    expect(resolveCardBackUrl({ effectPackId: "pack-a" })).toBeNull();
    expect(resolveCardBackUrl({})).toBeNull();
    expect(resolveCardBackUrl({ effectPackId: "unknown" })).toBeNull();
  });
});
