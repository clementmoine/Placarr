import path from "node:path";
import { describe, expect, it } from "vitest";

import { dbsJccEffectPack } from "@/effects/dbsjcc";
import { listCuratedBackSources } from "@/providers/shared/curatedCardsInstall";

import { dbsjccModule } from "./index";
import { dbsJccCuratedDir } from "./pack";

describe("dbsjcc provider hooks", () => {
  it("declares an empty local catalogue surface under Dragon Ball", () => {
    expect(dbsjccModule.info.id).toBe("dbsjcc");
    expect(dbsjccModule.catalog?.dataPack).toBe("dragonball/jcc");
    expect(dbsjccModule.searchPrints).toBeTypeOf("function");
    expect(dbsjccModule.lookupPrint).toBeTypeOf("function");
    expect(dbsjccModule.info.nameDatabase).toBe(true);
    expect(dbsjccModule.printGames).toEqual(["dbsjcc"]);
  });

  it("does not claim Bandai Masters, Fusion World, or Lamincards prints", async () => {
    await expect(
      dbsjccModule.lookupPrint!({ printKey: "dbscg:fb01-001" }),
    ).resolves.toBeNull();
    await expect(
      dbsjccModule.lookupPrint!({ printKey: "dbsfw:fs01-001" }),
    ).resolves.toBeNull();
    await expect(
      dbsjccModule.lookupPrint!({ printKey: "dbslamincards:nero-0001" }),
    ).resolves.toBeNull();
    await expect(
      dbsjccModule.lookupPrint!({ printKey: "naruto:uc-0001" }),
    ).resolves.toBeNull();
  });

  it("finds prints by name or normalized collector number", async () => {
    const byNumber = await dbsjccModule.searchPrints!({
      query: "D-1",
      language: "fr",
      limit: 1,
    });
    expect(byNumber[0]?.printKey).toBe("dbsjcc:part1-d0001");
    expect(byNumber[0]?.title).toBe("Goku");

    const bySp = await dbsjccModule.searchPrints!({
      query: "SP-25",
      language: "fr",
      limit: 1,
    });
    expect(bySp[0]?.printKey).toBe("dbsjcc:sp-sp0025");
    expect(bySp[0]?.title).toBe("Vegeto");
  });

  it("surfaces attested JA titles from nikita on shared D- keys", async () => {
    const langs = (await dbsjccModule.listPrintLanguages?.("tcg")) ?? [];
    expect(langs).toEqual(expect.arrayContaining(["ja", "fr"]));
    const oolong = await dbsjccModule.searchPrints!({
      query: "ウーロン",
      language: "ja",
      limit: 5,
    });
    expect(oolong.some((row) => row.printKey === "dbsjcc:part1-d0005")).toBe(
      true,
    );
  });
});

describe("dbsjcc curated back", () => {
  it("ships FR Shenron + nikita EN/JA sleeves", () => {
    expect(
      listCuratedBackSources(
        path.join(dbsJccCuratedDir(), "cards"),
      ).map((row) => row.destRel),
    ).toEqual(["back.en.webp", "back.ja.webp", "back.webp"]);
  });

  it("registers a catalogue-only effect pack", () => {
    expect(dbsJccEffectPack.id).toBe("dbs-jcc");
    expect(dbsJccEffectPack.listMaterials()).toEqual([]);
    expect(dbsJccEffectPack.resolveMaterial("foil", null)).toBeNull();
  });
});
