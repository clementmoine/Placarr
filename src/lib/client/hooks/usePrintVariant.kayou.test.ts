import { describe, expect, it } from "vitest";

import { variantRendering } from "@/lib/client/hooks/usePrintVariant";

describe("variantRendering kayou lenticular", () => {
  it("uses kayouLenticular + grid for collection HR prints", () => {
    const view = variantRendering("hr", {
      finishes: ["normal", "hr", "holo"],
      plainFinishes: ["normal"],
      effectPack: "naruto-kayou",
      foilMaskUrl: "/assets/naruto/kayou/full_foil_mask.webp",
      lenticularGrid: { cols: 2, rows: 2 },
    }, "/assets/naruto/kayou/cards/smritiheavenscrolls1/en/nrss.hr.002/art.narutocards.webp");

    expect(view.lenticularGrid).toEqual({ cols: 2, rows: 2 });
    expect(view.shader?.id).toBe("kayouLenticular");
    expect(view.foilMaskUrl).toBeTruthy();
  });

  it("passes scanCrop through for single-face portrait scans", () => {
    const crop = { left: 0, top: 0, right: 0, bottom: 4 };
    const view = variantRendering("hr", {
      finishes: ["normal", "hr"],
      plainFinishes: ["normal"],
      effectPack: "naruto-kayou",
      foilMaskUrl: "/assets/naruto/kayou/full_foil_mask.webp",
      scanCrop: crop,
    }, "/assets/naruto/kayou/cards/t4w1/en/nr.hr.003/art.narutocards.webp");

    expect(view.scanCrop).toEqual(crop);
    expect(view.lenticularGrid).toBeNull();
  });
});
