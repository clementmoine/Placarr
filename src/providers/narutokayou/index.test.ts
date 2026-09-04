import { afterEach, describe, expect, it } from "vitest";

import { narutoKayouEffectPack } from "@/effects/narutokayou";

import { stampKayouBack } from "./kayouBack";
import { kayouBackTierSlug } from "./kayouBackTier";
import {
  __setKayouOfficialCardBackManifestForTests,
  buildKayouOfficialCardBackManifest,
  resetKayouOfficialCardBackManifestCache,
} from "./kayouOfficialCardBacks";
import { narutokayouModule } from "./index";

afterEach(() => {
  resetKayouOfficialCardBackManifestCache();
});

describe("narutokayou provider hooks", () => {
  it("declares a Kayou local catalogue surface", () => {
    expect(narutokayouModule.info.id).toBe("narutokayou");
    expect(narutokayouModule.catalog?.dataPack).toBe("naruto/kayou");
    expect(narutokayouModule.searchPrints).toBeTypeOf("function");
    expect(narutokayouModule.lookupPrint).toBeTypeOf("function");
    expect(narutokayouModule.info.nameDatabase).toBe(true);
    expect(narutokayouModule.printGames).toEqual(["kayou"]);
    expect(narutokayouModule.info.catalogueLabel).toBe("Naruto Kayou");
  });

  it("does not claim foreign printKeys", async () => {
    await expect(
      narutokayouModule.lookupPrint!({ printKey: "mythos:ks1-0001" }),
    ).resolves.toBeNull();
    await expect(
      narutokayouModule.lookupPrint!({ printKey: "naruto:ni-0001" }),
    ).resolves.toBeNull();
  });

  it("stamps t4w3 nr.hr.084 with a 1×2 lenticular grid", async () => {
    const card = await narutokayouModule.lookupPrint!({
      printKey: "kayou:t4w3-nr.hr.084",
      language: "en",
    });
    expect(card?.lenticularGrid).toEqual({ cols: 1, rows: 2 });
    expect(card?.lenticularCropProfile).toBe("1x2-dual-wave");
    expect(card?.scanCrop).toBeUndefined();
  });

  it("stamps smritiheavenscrolls1 nrss.hr.005 with heaven 2×3 crop profile", async () => {
    const card = await narutokayouModule.lookupPrint!({
      printKey: "kayou:smritiheavenscrolls1-nrss.hr.005",
      language: "en",
    });
    expect(card?.lenticularGrid).toEqual({ cols: 2, rows: 3 });
    expect(card?.lenticularCropProfile).toBe("2x3-heaven-scroll");
  });

  it("stamps smritiheavenscrolls1 nrss.hr.002 with heaven 2×2 crop profile", async () => {
    const card = await narutokayouModule.lookupPrint!({
      printKey: "kayou:smritiheavenscrolls1-nrss.hr.002",
      language: "en",
    });
    expect(card?.lenticularGrid).toEqual({ cols: 2, rows: 2 });
    expect(card?.lenticularCropProfile).toBe("2x2-heaven-scroll");
  });
});

describe("narutokayou tier backs", () => {
  it("prefers per-card official back over tier sleeve", () => {
    __setKayouOfficialCardBackManifestForTests(
      buildKayouOfficialCardBackManifest(
        [
          {
            idCode: "NREA02-UR-015L3",
            url: "https://cdn/b.png",
            seriesId: "series-8idoe481",
            rarity: "UR",
          },
        ],
        { observed: "2026-08-28", seriesIds: ["series-8idoe481"] },
      ),
    );

    const stamped = stampKayouBack({
      printKey: "kayou:test",
      title: "Test",
      reference: "NREA02-UR-015L3",
      setLabel: "Test",
      rarity: "UR",
      language: "en",
      printed: true,
      effectPack: "naruto-kayou",
    });
    expect(stamped.cardBackUrl).toBe(
      "/assets/naruto/kayou/cards/official/nrea02-ur-015l3.webp",
    );
  });

  it("maps rarity to back.<tier> asset URL when no per-card back", () => {
    __setKayouOfficialCardBackManifestForTests({
      source: "",
      observed: "",
      cards: {},
      suffix: {},
    });
    const stamped = stampKayouBack({
      printKey: "kayou:test",
      title: "Test",
      reference: "NR-R-001",
      setLabel: "Test",
      rarity: "UR",
      language: "en",
      printed: true,
      effectPack: "naruto-kayou",
    });
    expect(stamped.cardBackUrl).toBe(
      "/assets/naruto/kayou/cards/back.ur.webp",
    );
  });

  it("normalizes ◇XR to shin-xr slug", () => {
    expect(kayouBackTierSlug("◇XR")).toBe("shin-xr");
  });
});

describe("narutokayou curated back", () => {
  it("registers a house-foil effect pack for the Foils tab", () => {
    expect(narutoKayouEffectPack.id).toBe("naruto-kayou");
    expect(narutoKayouEffectPack.listMaterials()).toEqual([
      "hr-2x2",
      "hr-3x2",
      "hr-3x1",
      "hr-2x1",
      "bp",
      "mr",
      "holo",
    ]);
    expect(narutoKayouEffectPack.parseMaterialName?.("hr-3x1")).toEqual({
      finish: "hr-3x1",
      varnish: null,
    });
    expect(narutoKayouEffectPack.resolveCss("holo", null).finishShaderId).toBe(
      "flare",
    );
    expect(narutoKayouEffectPack.resolveCss("hr-2x2", null)).toEqual({
      finishShaderId: "kayouLenticular",
      varnishShaderId: null,
      lenticularGrid: { cols: 2, rows: 2 },
      lenticularCropProfile: "2x2-heaven-scroll",
      landscapeFace: true,
    });
    expect(narutoKayouEffectPack.resolveCss("hr-3x2", null)).toEqual({
      finishShaderId: "kayouLenticular",
      varnishShaderId: null,
      lenticularGrid: { cols: 2, rows: 3 },
      lenticularCropProfile: "2x3-heaven-scroll",
      landscapeFace: true,
    });
    expect(narutoKayouEffectPack.resolveCss("hr-2x1", null)).toEqual({
      finishShaderId: "kayouLenticular",
      varnishShaderId: null,
      lenticularGrid: { cols: 1, rows: 2 },
      landscapeFace: true,
    });
    expect(narutoKayouEffectPack.resolveMaterial("holo", null)).toBeNull();
    expect(narutoKayouEffectPack.fallbackFoilMaskUrl).toContain(
      "full_foil_mask.webp",
    );
  });

  it("suggests foil playroom samples", () => {
    expect(narutokayouModule.suggestFoilPlayroomSamples).toBeTypeOf("function");
  });
});
