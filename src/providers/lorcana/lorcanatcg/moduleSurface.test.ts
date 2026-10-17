import { describe, expect, it } from "vitest";

import { listLorcanaTcgSets } from "./indexStore";
import { lorcanatcgModule } from "./index";

const hasLocalCatalogue = listLorcanaTcgSets().length > 0;

describe("lorcanatcg dataPack print surface", () => {
  it("exposes search / lookup / sets on the local corpus owner", () => {
    expect(lorcanatcgModule.searchPrints).toBeTypeOf("function");
    expect(lorcanatcgModule.lookupPrint).toBeTypeOf("function");
    expect(lorcanatcgModule.listPrintSets).toBeTypeOf("function");
    expect(lorcanatcgModule.listSetPrints).toBeTypeOf("function");
    expect(lorcanatcgModule.printGames).toEqual(["lorcana"]);
    expect(lorcanatcgModule.catalog?.dataPack).toBe("lorcana");
  });

  it.skipIf(!hasLocalCatalogue)(
    "lookupPrint resolves a local printKey without claiming foreign games",
    async () => {
      const sets = await lorcanatcgModule.listPrintSets!("tcg", "fr");
      expect(sets.length).toBeGreaterThan(0);
      const found = await lorcanatcgModule.searchPrints!({
        query: "",
        setId: sets[0]!.id,
        language: "fr",
        limit: 1,
      });
      expect(found.length).toBe(1);
      await expect(
        lorcanatcgModule.lookupPrint!({ printKey: found[0]!.printKey }),
      ).resolves.toMatchObject({ printKey: found[0]!.printKey });
      await expect(
        lorcanatcgModule.lookupPrint!({ printKey: "pokemon:sv1-001" }),
      ).resolves.toBeNull();
    },
  );
});
