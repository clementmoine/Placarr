import { describe, expect, it } from "vitest";

import {
  dbsFwCatalogueMaskUrl,
  dbsFwCoverageMaskFile,
  dbsFwKnownCoverageMaskUrl,
  dbsFwLayerSurfaces,
  fusionWorldCardBundle,
  fusionWorldMaskTexture,
  fusionWorldMaterialsParaPrint,
  setDbsFwMaskUrls,
} from "./masks";

describe("fusionWorldCardBundle", () => {
  it("maps a plain card, a parallel and a split front onto catalogue folders", () => {
    expect(
      fusionWorldCardBundle(
        "packdata_assets_card_series_st01_st01-004.bundle",
      ),
    ).toEqual({
      set: "st01",
      number: "004",
      folder: "004",
      partial: false,
    });
    expect(
      fusionWorldCardBundle(
        "packdata_assets_card_series_e_e-111_para.bundle",
      ),
    ).toMatchObject({ set: "e", number: "111", folder: "111-p1" });
    expect(
      fusionWorldCardBundle(
        "packdata_assets_card_series_fb01_fb01-001_front_para.bundle",
      ),
    ).toEqual({
      set: "fb01",
      number: "001",
      folder: "001-p1",
      partial: true,
    });
    expect(
      fusionWorldCardBundle(
        "packdata_assets_card_series_fb01_fb01-139_superpara.bundle",
      ),
    ).toMatchObject({ folder: "139-superpara", partial: false });
    expect(
      fusionWorldCardBundle(
        "packdata_assets_card_series_fb01_fb01-004_para_1an.bundle",
      ),
    ).toMatchObject({ folder: "004-para-1an" });
    expect(fusionWorldMaterialsParaPrint("E-106_PARA_Front")).toEqual({
      set: "e",
      number: "106",
      folder: "106-p1",
    });
    expect(fusionWorldMaterialsParaPrint("FW_E-106_PARA_Holo")).toEqual({
      set: "e",
      number: "106",
      folder: "106-p1",
    });
    expect(fusionWorldMaterialsParaPrint("E-106_Card")).toBeNull();
    expect(fusionWorldMaterialsParaPrint("FB01-139_SUPERPARA_Front")).toBeNull();
  });
});

describe("fusionWorldMaskTexture", () => {
  it("keeps holo, foil, effect and alpha masks and drops the printed face", () => {
    expect(fusionWorldMaskTexture("ST01-004_Holo")).toEqual({
      file: "mask.webp",
      langs: ["en", "ja"],
    });
    expect(fusionWorldMaskTexture("ST01-004_Holo_Field")?.file).toBe(
      "mask-field.webp",
    );
    expect(fusionWorldMaskTexture("ST01-004_PARA_Foil_En")).toEqual({
      file: "mask-foil.webp",
      langs: ["en"],
    });
    expect(fusionWorldMaskTexture("ST01-004_PARA_Foil_Ja")?.langs).toEqual([
      "ja",
    ]);
    expect(fusionWorldMaskTexture("ef_mask02_CF")?.file).toBe(
      "mask-ef-02-cf.webp",
    );
    expect(fusionWorldMaskTexture("FB01-139_Battle_SCR-SUPERPARA_alp_to")?.file).toBe(
      "mask-alpha-to.webp",
    );
    expect(fusionWorldMaskTexture("ST01-004_PARA_Front")).toBeNull();
    expect(fusionWorldMaskTexture("ST01-004_Text_En")).toBeNull();
    expect(fusionWorldMaskTexture("ST01-004_Thumbnail")).toBeNull();
  });

  it("maps PARA_HOLO_Text overlays without treating them as face language plates", () => {
    expect(fusionWorldMaskTexture("ST01-020_PARA_HOLO_Text_En")).toEqual({
      file: "mask-holo-text.webp",
      langs: ["en"],
    });
    expect(fusionWorldMaskTexture("ST01-020_PARA_HOLO_Text_Ja")).toEqual({
      file: "mask-holo-text.webp",
      langs: ["ja"],
    });
    expect(
      fusionWorldCardBundle(
        "packdata_assets_card_series_st01_st01-020_para_holo.bundle",
      ),
    ).toMatchObject({ folder: "020-para-holo", partial: false });
  });
});

describe("catalogue mask urls", () => {
  it("rewrites a face url onto the mask file beside it", () => {
    expect(
      dbsFwCatalogueMaskUrl(
        "/assets/dragonball/fw/cards/en/sb02/024/art.dbscards.webp",
        "mask.webp",
      ),
    ).toBe("/assets/dragonball/fw/cards/en/sb02/024/mask.webp");
    expect(dbsFwCoverageMaskFile((file) => file === "mask-foil.webp")).toBe(
      "mask-foil.webp",
    );
    expect(
      dbsFwCoverageMaskFile(
        (file) => file === "mask.webp" || file === "mask-foil.webp",
      ),
    ).toBe("mask-foil.webp");
    expect(dbsFwCoverageMaskFile((file) => file === "mask-ef-01.webp")).toBe(
      "mask-ef-01.webp",
    );
    expect(dbsFwCoverageMaskFile(() => false)).toBeNull();
    setDbsFwMaskUrls([
      "/assets/dragonball/fw/cards/en/e/111-p1/mask.webp",
      "/assets/dragonball/fw/cards/en/st01/004-p1/mask-foil.webp",
      "/assets/dragonball/fw/cards/en/st01/004-p1/mask.webp",
    ]);
    expect(
      dbsFwKnownCoverageMaskUrl(
        "/assets/dragonball/fw/cards/en/e/111-p1/art.client.webp",
        "mask-foil.webp",
      ),
    ).toBe("/assets/dragonball/fw/cards/en/e/111-p1/mask.webp");
    expect(
      dbsFwKnownCoverageMaskUrl(
        "/assets/dragonball/fw/cards/en/st01/004-p1/art.client.webp",
        "mask-foil.webp",
      ),
    ).toBe("/assets/dragonball/fw/cards/en/st01/004-p1/mask-foil.webp");
    setDbsFwMaskUrls([]);
    expect(
      dbsFwLayerSurfaces(
        "/assets/dragonball/fw/cards/en/fb01/001/art.client.webp",
      ),
    ).toEqual({
      frontUrl: "/assets/dragonball/fw/cards/en/fb01/001/layer.picture.webp",
      frameUrl: "/assets/dragonball/fw/cards/en/fb01/001/layer.frame.webp",
      inkUrl: "/assets/dragonball/fw/cards/en/fb01/001/layer.text.webp",
      costRingUrl: "/assets/dragonball/fw/cards/en/fb01/001/layer.costRing.webp",
      badgeUrl: "/assets/dragonball/fw/cards/en/fb01/001/layer.badge.webp",
      holoMaskUrl: "/assets/dragonball/fw/cards/en/fb01/001/mask.webp",
    });
    expect(
      dbsFwLayerSurfaces(
        "/assets/dragonball/fw/cards/en/fb01/001/back.client.webp",
      )?.frontUrl,
    ).toBe("/assets/dragonball/fw/cards/en/fb01/001/layer.back-picture.webp");
    expect(
      dbsFwLayerSurfaces("/assets/dragonball/fw/textures/client-holomap.webp"),
    ).toBeNull();
  });
});
