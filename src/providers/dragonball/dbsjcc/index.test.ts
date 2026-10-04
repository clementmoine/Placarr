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
    expect(dbsjccModule.info.defaultLanguage).toBe("fr");
  });

  it("prefers FR face when language is omitted (shelf / enrich default)", async () => {
    const hit = await dbsjccModule.lookupPrint!({
      printKey: "dbsjcc:part2-d0172",
    });
    expect(hit?.language).toBe("fr");
    expect(hit?.imageUrl).toMatch(/\/fr\/d0172\//);
    expect(hit?.imageUrl).not.toMatch(/\/ja\//);
    expect(hit?.title).toBe("Cell");
  });

  it("labels Série sets like Naruto Carddass (S1 — Série 1 — …)", async () => {
    const sets = await dbsjccModule.listPrintSets!("tcg", "fr");
    const part1 = sets.find((row) => row.id === "part1");
    expect(part1?.label).toBe("S1 — Série 1 — Super-Saiyans");
    expect(part1?.iconUrl).toBeUndefined();
    const promo = sets.find((row) => row.id === "promo");
    expect(promo?.label).toBe("PROMO — Promo (hors série)");
    expect(promo?.iconUrl).toBeUndefined();
    const sp = sets.find((row) => row.id === "sp");
    expect(sp?.label).toBe("SP — Hors-série");
    const detecteur = sets.find((row) => row.id === "accessory");
    expect(detecteur?.label).toBe("Détecteur");
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

  it("resolves a legacy multi-set clone onto the canonical art letter", async () => {
    const hit = await dbsjccModule.lookupPrint!({
      printKey: "dbsjcc:part3-d0123",
      language: "fr",
    });
    expect(hit?.printKey).toBe("dbsjcc:part2-d0123b");
    expect(hit?.reference).toBe("D-123b");
  });

  it("finds prints by name or normalized collector number", async () => {
    const byNumber = await dbsjccModule.searchPrints!({
      query: "D-1",
      language: "fr",
      limit: 1,
    });
    expect(byNumber[0]?.printKey).toBe("dbsjcc:part1-d0001");
    expect(byNumber[0]?.title).toBe("Goku");
    expect(byNumber[0]?.reference).toBe("D-1");

    const bySp = await dbsjccModule.searchPrints!({
      query: "SP-25",
      language: "fr",
      limit: 1,
    });
    expect(bySp[0]?.printKey).toBe("dbsjcc:sp-sp0025");
    expect(bySp[0]?.title).toBe("Vegeto");
    expect(bySp[0]?.reference).toBe("SP-25");
  });

  it("expands a short collector typed as d-15 to d-150…", async () => {
    const found = await dbsjccModule.searchPrints!({
      query: "d-15",
      language: "fr",
      limit: 40,
    });
    const refs = found.map((row) => row.reference);
    expect(refs).toEqual(expect.arrayContaining(["D-15", "D-150"]));
    expect(refs.some((ref) => ref === "D-115")).toBe(false);
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

  it("registers a catalogue-only effect pack with house holo flare", () => {
    expect(dbsJccEffectPack.id).toBe("dbs-jcc");
    expect(dbsJccEffectPack.listMaterials()).toEqual([]);
    expect(dbsJccEffectPack.resolveMaterial("foil", null)).toBeNull();
    expect(dbsJccEffectPack.resolveCss("holo", null).finishShaderId).toBe(
      "flare",
    );
    expect(dbsJccEffectPack.fallbackFoilMaskUrl).toContain("full_foil_mask");
  });

  it("offers the holo finish + mask on Holo rarity prints", async () => {
    const holo = await dbsjccModule.lookupPrint!({
      printKey: "dbsjcc:part1-d0030a",
      language: "fr",
    });
    expect(holo?.rarity).toMatch(/holo/i);
    expect(holo?.finishes).toEqual(["holo"]);
    expect(holo?.plainFinishes).toEqual(["None"]);
    expect(holo?.foilMaskUrl).toContain("full_foil_mask");
  });

  it("offers the holo finish on SP-25 (dbzc « Hors série » foil)", async () => {
    const sp = await dbsjccModule.lookupPrint!({
      printKey: "dbsjcc:sp-sp0025",
      language: "fr",
    });
    expect(sp?.rarity).toMatch(/holo/i);
    expect(sp?.finishes).toEqual(["holo"]);
    expect(sp?.foilMaskUrl).toContain("full_foil_mask");
  });
});
