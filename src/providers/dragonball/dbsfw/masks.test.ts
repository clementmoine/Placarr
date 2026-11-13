import { describe, expect, it } from "vitest";

import {
  dbsFwCatalogueMaskUrl,
  dbsFwCoverageMaskFile,
  dbsFwLayerSurfaces,
  fusionWorldCardBundle,
  fusionWorldMaskTexture,
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
    expect(dbsFwCoverageMaskFile(() => false)).toBeNull();
    expect(
      dbsFwLayerSurfaces(
        "/assets/dragonball/fw/cards/en/fb01/001/art.client.webp",
      ),
    ).toEqual({
      frontUrl: "/assets/dragonball/fw/cards/en/fb01/001/layer.picture.webp",
      frameUrl: "/assets/dragonball/fw/cards/en/fb01/001/layer.frame.webp",
      inkUrl: "/assets/dragonball/fw/cards/en/fb01/001/layer.text.webp",
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
