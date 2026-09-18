import path from "node:path";
import { describe, expect, it } from "vitest";

import { dbsLamincardsEffectPack } from "@/effects/dbslamincards";
import { listCuratedBackSources } from "@/providers/shared/curatedCardsInstall";

import { dbslamincardsModule } from "./index";
import { dbsLamincardsCuratedDir } from "./pack";

describe("dbslamincards provider hooks", () => {
  it("declares an empty local catalogue surface under Dragon Ball", () => {
    expect(dbslamincardsModule.info.id).toBe("dbslamincards");
    expect(dbslamincardsModule.catalog?.dataPack).toBe("dbs/lamincards");
    expect(dbslamincardsModule.searchPrints).toBeTypeOf("function");
    expect(dbslamincardsModule.lookupPrint).toBeTypeOf("function");
    expect(dbslamincardsModule.info.nameDatabase).toBe(true);
    expect(dbslamincardsModule.printGames).toEqual(["dbslamincards"]);
  });

  it("does not claim Bandai Masters or Fusion World prints", async () => {
    await expect(
      dbslamincardsModule.lookupPrint!({ printKey: "dbscg:fb01-001" }),
    ).resolves.toBeNull();
    await expect(
      dbslamincardsModule.lookupPrint!({ printKey: "dbsfw:fs01-001" }),
    ).resolves.toBeNull();
    await expect(
      dbslamincardsModule.lookupPrint!({ printKey: "naruto:uc-0001" }),
    ).resolves.toBeNull();
  });
});

describe("dbslamincards curated back", () => {
  it("ships only the IT series sleeve (no fake FR pack back)", () => {
    expect(
      listCuratedBackSources(
        path.join(dbsLamincardsCuratedDir(), "cards"),
      ).map((row) => row.destRel),
    ).toEqual(["back.it.webp"]);
  });

  it("registers a catalogue-only effect pack", () => {
    expect(dbsLamincardsEffectPack.id).toBe("dbs-lamincards");
    expect(dbsLamincardsEffectPack.listMaterials()).toEqual([]);
    expect(dbsLamincardsEffectPack.resolveMaterial("foil", null)).toBeNull();
  });
});
