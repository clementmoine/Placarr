import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetEffectPacksForTests,
  registerEffectPack,
} from "@/core/render/foil/backend";
import type { EffectPackModule, FoilMaterial } from "@/core/render/foil/types";
import { lorcanaEffectPack } from "@/effects/lorcana";
import { listLorcanaMaterialNames } from "@/effects/lorcana/manifest";

import {
  foilMaterialHasTimeSibling,
  foilMaterialUsesSecondTopLayer,
  resolveFoilCardMaterial,
} from "./resolveCardMaterial";

const BASE: FoilMaterial = {
  graph: "Test",
  keywords: [],
  fragment: "Base.frag",
  textures: {},
  floats: {},
  colors: {},
};

describe("resolveFoilCardMaterial", () => {
  beforeEach(() => {
    __resetEffectPacksForTests();
  });

  it("returns null without a pack", () => {
    expect(
      resolveFoilCardMaterial({ pack: null, materialName: "Lore" }),
    ).toBeNull();
  });

  it("prefers materialForPrint over bare material", () => {
    const pack: EffectPackModule = {
      id: "test",
      assetBase: "/assets/test",
      cardBackUrl: "/assets/test/back",
      resolveMaterial: () => null,
      resolveMaterialForPrint: () => null,
      resolveCss: () => ({ finishShaderId: null, varnishShaderId: null }),
      listMaterials: () => ["Base"],
      material: () => BASE,
      materialForPrint: (_name, opts) =>
        opts?.secondVarnishMaskUrl
          ? {
              ...BASE,
              fragment: "Base___USESECONDTOPLAYER.frag",
              keywords: ["_USESECONDTOPLAYER"],
            }
          : BASE,
    };
    registerEffectPack(pack);

    expect(
      resolveFoilCardMaterial({
        pack,
        materialName: "Base",
      })?.fragment,
    ).toBe("Base.frag");
    expect(
      resolveFoilCardMaterial({
        pack,
        materialName: "Base",
        secondVarnishMaskUrl: "/mask.png",
      })?.fragment,
    ).toContain("USESECONDTOPLAYER");
  });

  it.skipIf(
    !listLorcanaMaterialNames().includes("CardMagmaMetallicHotFoil"),
  )(
    "Lorcana pack upgrades to USESECONDTOPLAYER when second varnish is set",
    () => {
      registerEffectPack(lorcanaEffectPack);

      const plain = resolveFoilCardMaterial({
        pack: lorcanaEffectPack,
        materialName: "CardMagmaMetallicHotFoil",
      });
      const upgraded = resolveFoilCardMaterial({
        pack: lorcanaEffectPack,
        materialName: "CardMagmaMetallicHotFoil",
        secondVarnishMaskUrl: "/uploads/second.png",
      });
      expect(plain).toBeTruthy();
      expect(upgraded).toBeTruthy();
      expect(upgraded!.fragment).not.toBe(plain!.fragment);
      expect(foilMaterialUsesSecondTopLayer(upgraded)).toBe(true);
      expect(foilMaterialHasTimeSibling(upgraded)).toBe(
        Boolean(upgraded!.fragmentTime),
      );
    },
  );
});

describe("foilMaterialHasTimeSibling / UsesSecondTopLayer", () => {
  it("detects fragmentTime and USESECONDTOPLAYER markers", () => {
    expect(foilMaterialHasTimeSibling(BASE)).toBe(false);
    expect(
      foilMaterialHasTimeSibling({
        ...BASE,
        fragmentTime: "Base___SCROLLMODE_TIME.frag",
      }),
    ).toBe(true);
    expect(foilMaterialUsesSecondTopLayer(BASE)).toBe(false);
    expect(
      foilMaterialUsesSecondTopLayer({
        ...BASE,
        fragment: "X___USESECONDTOPLAYER___Y.frag",
      }),
    ).toBe(true);
  });
});
