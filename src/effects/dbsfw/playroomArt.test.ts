import { describe, expect, it } from "vitest";

import { DBS_FW_CLIENT_RENDERS } from "./clientRenders";
import { dbsFwEffectPack } from "./index";
import { dbsFwMaterialRecipe } from "./materialRecipes";
import { DBS_FW_S3TC_BY_WEBP } from "./s3tcSidecars.generated";

describe("dbsFwEffectPack playroom arts", () => {
  const materials = dbsFwEffectPack.listMaterials?.() ?? [];

  it("lists every client render (shader + plate inventory)", () => {
    expect(materials).toEqual(DBS_FW_CLIENT_RENDERS.map((row) => row.id));
  });

  it.each(
    DBS_FW_CLIENT_RENDERS.filter((row) => row.shader).map((row) => row.id),
  )("%s has a distinct real catalogue face (not a shared SB02 seed)", (id) => {
    const art = dbsFwEffectPack.playroomArtForMaterial?.(id);
    expect(art?.imageUrl).toBeTruthy();
    expect(art?.imageUrl).toMatch(/\/cards\/en\//);
    expect(art?.imageUrl).not.toMatch(/sb02\/024/);
    expect(art?.label).toMatch(/branché/);
    expect(art?.liveOwned).toBe(true);
  });

  it("gives every branched leaf its own catalogue print (no ST01 seed reuse)", () => {
    const branched = DBS_FW_CLIENT_RENDERS.filter((row) => row.shader);
    const urls = branched.map(
      (row) => dbsFwEffectPack.playroomArtForMaterial?.(row.id)?.imageUrl,
    );
    expect(urls.every(Boolean)).toBe(true);
    expect(new Set(urls).size).toBe(branched.length);
    for (const row of branched) {
      expect(row.playroomFace?.path, row.id).toBeTruthy();
    }
  });

  it.each(
    DBS_FW_CLIENT_RENDERS.filter((row) => !row.shader).map((row) => row.id),
  )("%s is plate-only inventory (inutilisé, no shader material)", (id) => {
    const art = dbsFwEffectPack.playroomArtForMaterial?.(id);
    expect(art?.imageUrl).toMatch(/\/textures\//);
    expect(art?.label).toMatch(/inutilisé/);
    expect(dbsFwEffectPack.material?.(id)).toBeNull();
  });

  it("binds Mac DXT/S3TC sidecars on Frost plate files (Lorcana ASTC twin)", () => {
    expect(DBS_FW_S3TC_BY_WEBP["client-holomap.webp"]?.format).toMatch(/S3TC/);
    expect(DBS_FW_S3TC_BY_WEBP["client-holorainbow.webp"]?.format).toMatch(
      /S3TC/,
    );
    expect(DBS_FW_S3TC_BY_WEBP["client-tabac-holo.webp"]?.format).toMatch(
      /S3TC/,
    );
    // CardHologram is BC7 on Mac — raster only (no portable WebGL BC7 bind).
    expect(DBS_FW_S3TC_BY_WEBP["client-cardhologram.webp"]).toBeUndefined();
    // HoloMap_main2 is RGBA32 @ odd size — no DXT sidecar (unlike main/main3).
    expect(DBS_FW_S3TC_BY_WEBP["client-holomap-main2.webp"]).toBeUndefined();

    const foil = dbsFwEffectPack.material?.("foil-holo");
    expect(foil?.textures._HoloMap?.s3tc?.file).toBe("client-holomap.dxt5");
    expect(foil?.textures._RainbowTexture?.s3tc?.file).toBe(
      "client-holorainbow.dxt1",
    );
    // Card Foil_holo dump: EFFECTS_LAYER_COUNT_ZERO — no array pack.
    expect(foil?.textures._EffectsLayersTex).toBeUndefined();
    expect(foil?.floats.EFFECTS_LAYER_COUNT).toBe(0);
    expect(foil?.floats._FoilType).toBe(2);
    expect(foil?.keywords).toContain("EFFECTS_LAYER_COUNT_ZERO");

    const tabac = dbsFwEffectPack.material?.("tabac-holo");
    // Coverage + stamp share the Tabac plate; steer map stays shared HoloMap.
    expect(tabac?.textures._FoilMask?.s3tc?.file).toBe("client-tabac-holo.dxt1");
    expect(tabac?.textures._HoloMask?.s3tc?.file).toBe("client-tabac-holo.dxt1");
    expect(tabac?.textures._HoloMap?.s3tc?.file).toBe("client-holomap.dxt5");
    expect(tabac?.floats.EFFECTS_LAYER_COUNT).toBe(1);
    expect(tabac?.floats._EffectsLayer1MotionSpeed).toBe(3);
    expect(tabac?.textures._EffectsLayersTex?.arrayLayers?.[0]?.file).toBe(
      "client-uv-shine.webp",
    );

    const shine = dbsFwEffectPack.material?.("effects-uv-shine");
    expect(shine?.textures._EffectsLayersTex?.arrayLayers?.[0]?.file).toBe(
      "client-uv-shine.webp",
    );

    const pakipaki = dbsFwEffectPack.material?.("pakipaki");
    expect(pakipaki?.floats._FoilPakipaki).toBe(1);
    expect(pakipaki?.textures._HoloMap?.file).toBe("client-pakipakifoil.webp");

    const champ = dbsFwEffectPack.material?.("card-hologram");
    expect(champ?.floats._ChampionshipHologram).toBe(1);
    expect(champ?.textures._HoloMap?.file).toBe("client-cardhologram.webp");

    // UIHologram.frag is a UI badge shader — inventory plate only in playroom.
    expect(dbsFwEffectPack.material?.("ui-hologram")).toBeNull();
    const uiArt = dbsFwEffectPack.playroomArtForMaterial?.("ui-hologram");
    expect(uiArt?.imageUrl).toMatch(/client-tabac-holo\.webp/);
    expect(uiArt?.label).toMatch(/inutilisé/);
  });

  it.each(
    DBS_FW_CLIENT_RENDERS.filter((row) => row.shader).map((row) => row.id),
  )("%s material matches dump recipe floats + WebGL fragment", (id) => {
    const recipe = dbsFwMaterialRecipe(id);
    expect(recipe, id).toBeTruthy();
    const mat = dbsFwEffectPack.material?.(id);
    expect(mat, id).toBeTruthy();
    expect(mat!.webgl).toBe(true);
    expect(mat!.fragment).toMatch(/FrostCard|UIHologram/);
    for (const [key, value] of Object.entries(recipe!.floats)) {
      expect(mat!.floats[key], `${id}.${key}`).toBe(value);
    }
    for (const kw of recipe!.keywords) {
      expect(mat!.keywords, id).toContain(kw);
    }
    const layers = DBS_FW_CLIENT_RENDERS.find((r) => r.id === id)?.effectsLayers;
    if (layers && layers.length > 0) {
      expect(mat!.textures._EffectsLayersTex?.arrayLayers).toHaveLength(
        layers.length,
      );
      expect(mat!.textures._EffectsLayersMotion?.arrayLayers).toHaveLength(
        layers.length,
      );
    } else if (mat!.fragment === "FrostCard.frag") {
      expect(mat!.textures._EffectsLayersTex).toBeUndefined();
    }
  });

  it("foil-holo uses catalogue mask-foil stamp + dedicated holo plate", () => {
    const row = DBS_FW_CLIENT_RENDERS.find((r) => r.id === "foil-holo");
    expect(row?.cardMask).toBe("mask-foil.webp");
    expect(row?.holoPlate).toBe("client-st01-004-para-holo.webp");
    expect(dbsFwMaterialRecipe("foil-holo")?.floats._FoilType).toBe(2);
    const mat = dbsFwEffectPack.material?.("foil-holo");
    expect(mat?.textures._FoilMask).toEqual({ role: "foilMask" });
    expect(mat?.textures._HoloMask?.file).toBe(row?.holoPlate);
  });

  it("para: FoilType 0 + inverted Unity HoloMask (Frost 1-x)", () => {
    const row = DBS_FW_CLIENT_RENDERS.find((r) => r.id === "para");
    expect(row?.cardMask).toBeUndefined();
    expect(row?.holoPlate).toMatch(/holomask\.webp$/);
    expect(dbsFwMaterialRecipe("para")?.floats._FoilType).toBe(0);
    const mat = dbsFwEffectPack.material?.("para");
    expect(mat?.textures._FoilMask).toBeUndefined();
    expect(mat?.textures._HoloMask?.file).toBe(row?.holoPlate);
    const art = dbsFwEffectPack.playroomArtForMaterial?.("para");
    expect(art?.maskUrl).toContain(`/textures/${row?.holoPlate}`);
  });

  it("e106-para: materials PARA on e/106-p1 + FoilType 0 + inverted HoloMask", () => {
    const row = DBS_FW_CLIENT_RENDERS.find((r) => r.id === "e106-para");
    expect(row?.playroomFace?.path).toBe("e/106-p1");
    expect(row?.holoPlate).toMatch(/holomask\.webp$/);
    expect(row?.cardMask).toBeUndefined();
    expect(dbsFwMaterialRecipe("e106-para")?.floats._FoilType).toBe(0);
    const mat = dbsFwEffectPack.material?.("e106-para");
    expect(mat?.textures._HoloMask?.file).toBe(row?.holoPlate);
    const art = dbsFwEffectPack.playroomArtForMaterial?.("e106-para");
    expect(art?.maskUrl).toContain(`/textures/${row?.holoPlate}`);
  });

  it("superpara keeps ef_mask coverage + two packed effects layers", () => {
    const row = DBS_FW_CLIENT_RENDERS.find((r) => r.id === "superpara");
    expect(row?.cardMask).toBe("mask-ef-01.webp");
    expect(row?.effectsLayers).toHaveLength(2);
    const mat = dbsFwEffectPack.material?.("superpara");
    expect(mat?.floats.EFFECTS_LAYER_COUNT).toBe(2);
    expect(mat?.textures._EffectsLayersTex?.arrayLayers?.map((l) => l.file)).toEqual(
      ["client-uv-shine.webp", "client-ef-flash01.webp"],
    );
  });

  it("resolveCss maps shelf foil→flare but not WebGL leaf ids (no house holofoil)", () => {
    expect(dbsFwEffectPack.resolveCss("foil", null).finishShaderId).toBe(
      "flare",
    );
    for (const id of DBS_FW_CLIENT_RENDERS.filter((r) => r.shader).map(
      (r) => r.id,
    )) {
      expect(
        dbsFwEffectPack.resolveCss(id, null).finishShaderId,
        id,
      ).toBeNull();
    }
  });
});
