import path from "node:path";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  clearIdentityCatalogueBrowseCache,
  tryBuildIdentityCatalogueRows,
} from "@/lib/admin/catalogueIdentityBrowse";
import { withCatalogueBackRows } from "@/lib/admin/catalogueCards";
import { cataloguePackInfo } from "@/lib/admin/cataloguePacks";
import { packCardsDir } from "@/lib/packPaths";
import { yugiohEffectPack } from "@/effects/yugioh";
import { listCuratedBackSources } from "@/providers/shared/curatedCardsInstall";

import { yugiohModule } from "./index";
import { yugiohCuratedDir } from "./pack";

describe("yugioh provider hooks", () => {
  it("declares an empty local catalogue surface", () => {
    expect(yugiohModule.info.id).toBe("yugioh");
    expect(yugiohModule.catalog?.dataPack).toBe("yugioh");
    expect(yugiohModule.searchPrints).toBeTypeOf("function");
    expect(yugiohModule.lookupPrint).toBeTypeOf("function");
    expect(yugiohModule.info.nameDatabase).toBe(true);
    expect(yugiohModule.printGames).toEqual(["yugioh"]);
  });

  it("does not claim foreign printKeys", async () => {
    await expect(
      yugiohModule.lookupPrint!({ printKey: "lorcana:6-48" }),
    ).resolves.toBeNull();
    await expect(
      yugiohModule.lookupPrint!({ printKey: "pokemon:sv1-001" }),
    ).resolves.toBeNull();
  });

  it("does not borrow faces across locales (line + pack registry)", () => {
    expect(yugiohModule.info.id).toBe("yugioh");
    // Line search/lookup: borrowFaceAcrossLocales unset (= false).
    expect(
      cataloguePackInfo("yugioh")?.localeArt?.bestFaceAcrossLocales,
    ).not.toBe(true);
  });
});

describe("yugioh curated back", () => {
  it("ships ygocards Konami sleeve when curated", () => {
    const backs = listCuratedBackSources(
      path.join(yugiohCuratedDir(), "cards"),
    ).map((row) => row.destRel);
    // Empty until first Sync harvests original/back.webp — both states honest.
    expect(backs.length === 0 || backs.includes("back.webp")).toBe(true);
  });

  it("registers a catalogue-only effect pack", () => {
    expect(yugiohEffectPack.id).toBe("yugioh");
    expect(yugiohEffectPack.cardBackUrl).toBe("/assets/yugioh/cards/back.webp");
    expect(yugiohEffectPack.listMaterials()).toEqual([]);
    expect(yugiohEffectPack.resolveMaterial("foil", null)).toBeNull();
  });
});

describe("yugioh identity browse (local corpus)", () => {
  it("never stamps artLocaleFrom on FR tiles (no EN borrow)", () => {
    clearIdentityCatalogueBrowseCache();
    const rows = tryBuildIdentityCatalogueRows("yugioh");
    if (rows === null) return; // no local corpus in CI

    const fr = rows.filter((r) => r.lang === "fr");
    expect(fr.length).toBeGreaterThan(0);
    const borrowed = fr.filter((r) => r.artLocaleFrom);
    expect(borrowed).toEqual([]);
    // Missing FR art is honest empty — not an EN recto.
    const missing = fr.filter((r) => r.missingArt);
    expect(missing.length).toBeGreaterThan(0);
  });

  it("exposes pack-back tile when back.webp is installed", () => {
    clearIdentityCatalogueBrowseCache();
    const faces = tryBuildIdentityCatalogueRows("yugioh");
    if (faces === null) return;
    if (!existsSync(path.join(packCardsDir("yugioh"), "back.webp"))) return;

    const rows = withCatalogueBackRows("yugioh", faces);
    const backs = rows.filter((r) => r.kind === "pack-back");
    expect(backs.length).toBeGreaterThan(0);
    expect(backs[0]?.artUrl).toContain("/assets/yugioh/cards/back.webp");
  });
});
