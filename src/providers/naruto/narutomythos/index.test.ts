import path from "node:path";
import { describe, expect, it } from "vitest";
import { narutoMythosEffectPack } from "@/effects/narutomythos";
import { listCuratedBackSources } from "@/providers/shared/curatedCardsInstall";
import { narutomythosModule } from "./index";
import { narutoMythosCuratedDir } from "./pack";

// —— index ——
{
  describe("narutomythos provider hooks", () => {
    it("declares a Mythos local catalogue surface", () => {
      expect(narutomythosModule.info.id).toBe("narutomythos");
      expect(narutomythosModule.catalog?.dataPack).toBe("naruto/mythos");
      expect(narutomythosModule.searchPrints).toBeTypeOf("function");
      expect(narutomythosModule.lookupPrint).toBeTypeOf("function");
      expect(narutomythosModule.info.nameDatabase).toBe(true);
      expect(narutomythosModule.printGames).toEqual(["mythos"]);
      expect(narutomythosModule.info.catalogueLabel).toBe("Naruto Mythos");
    });

    it("does not claim foreign printKeys", async () => {
      await expect(
        narutomythosModule.lookupPrint!({ printKey: "naruto:nr-0001" }),
      ).resolves.toBeNull();
      await expect(
        narutomythosModule.lookupPrint!({ printKey: "lorcana:6-48" }),
      ).resolves.toBeNull();
    });
  });

  describe("narutomythos curated back", () => {
    it("ships an attested pack back from narutotcgmythos.com", () => {
      expect(
        listCuratedBackSources(path.join(narutoMythosCuratedDir(), "cards")).map(
          (row) => row.destRel,
        ),
      ).toEqual(["back.webp"]);
    });

    it("registers a catalogue-only effect pack with house holo flare", () => {
      expect(narutoMythosEffectPack.id).toBe("naruto-mythos");
      expect(narutoMythosEffectPack.listMaterials()).toEqual(["holo"]);
      expect(narutoMythosEffectPack.resolveCss("holo", null).finishShaderId).toBe(
        "flare",
      );
      expect(narutoMythosEffectPack.resolveMaterial("foil", null)).toBeNull();
      expect(narutoMythosEffectPack.fallbackFoilMaskUrl).toContain(
        "full_foil_mask",
      );
    });

    it("stamps foil on the KS1 promo Mythos VV2 parallel", async () => {
      const print = await narutomythosModule.lookupPrint!({
        printKey: "mythos:ks1promo-0133-vv2",
        language: "fr",
      });
      expect(print?.rarity).toBe("M");
      expect(print?.finishes).toEqual(["holo"]);
      expect(print?.foilMaskUrl).toContain("full_foil_mask");
    });
  });
}
