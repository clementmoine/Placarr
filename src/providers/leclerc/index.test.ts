import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  leclercDisneyEffectPack,
  leclercMarvelEffectPack,
} from "@/effects/leclerc";
import { listCuratedBackSources } from "@/providers/shared/curatedCardsInstall";

import { buildLeclercFromLedgers } from "./buildFromLedgers";
import {
  leclercDisney25Module,
  leclercMarvel21Module,
  leclercModules,
} from "./index";
import { LECLERC_ACTIVE_OPS } from "./pack";
import { leclercCuratedDir } from "./curatedPaths";
import {
  formatLeclercReference,
  leclercPrintKey,
  leclercSetLabel,
} from "./printKey";

describe("leclerc provider hooks", () => {
  it("declares one local catalogue line per active opération", () => {
    expect(leclercModules.map((m) => m.info.id)).toEqual(
      LECLERC_ACTIVE_OPS.map((op) => op.providerId),
    );
    expect(leclercMarvel21Module.catalog?.dataPack).toBe("leclerc/marvel21");
    expect(leclercDisney25Module.catalog?.dataPack).toBe("leclerc/disney25");
    expect(leclercMarvel21Module.printGames).toEqual(["leclerc"]);
    expect(leclercDisney25Module.printGames).toEqual(["leclerc"]);
  });

  it("does not claim foreign printKeys", async () => {
    await expect(
      leclercMarvel21Module.lookupPrint!({ printKey: "lorcana:6-48" }),
    ).resolves.toBeNull();
    await expect(
      leclercDisney25Module.lookupPrint!({ printKey: "dbscg:bt1-001" }),
    ).resolves.toBeNull();
  });
});

describe("leclerc printKey / ledgers", () => {
  it("builds printKeys for cards and Fixeez", () => {
    expect(leclercPrintKey("disney25", "001")).toBe("leclerc:disney25-001");
    expect(leclercPrintKey("marvel24", "f01")).toBe("leclerc:marvel24-f01");
    expect(formatLeclercReference("marvel23", "f12")).toBe("MARVEL23-F12");
  });

  it("labels sets as year + franchise + title", () => {
    expect(leclercSetLabel("marvel21")).toBe("2021 Marvel: Révèle ton Pouvoir");
    expect(leclercSetLabel("marvel24")).toBe(
      "2024 Marvel: Explore L'Univers Marvel avec Groot",
    );
    expect(leclercSetLabel("disney25")).toBe(
      "2025 Disney: Découvre la magie de Disney",
    );
    expect(leclercSetLabel("sw19sb")).toBe(
      "2019 Star Wars: Maîtriser la Force - Sticker Backs",
    );
  });

  it("seeds each opération ledger into its own pack", () => {
    const marvel21 = buildLeclercFromLedgers({
      setCode: "marvel21",
      dryRun: true,
    });
    const disney25 = buildLeclercFromLedgers({
      setCode: "disney25",
      dryRun: true,
    });
    const marvel24 = buildLeclercFromLedgers({
      setCode: "marvel24",
      dryRun: true,
    });
    expect(marvel21.sets).toEqual(["marvel21"]);
    expect(marvel21.prints).toBe(108);
    expect(marvel21.placeholders).toBe(0);
    expect(disney25.sets).toEqual(["disney25"]);
    expect(disney25.prints).toBe(132);
    expect(disney25.placeholders).toBe(0);
    expect(marvel24.prints).toBe(132);
    expect(marvel24.placeholders).toBe(0);
  });
});

describe("leclerc curated back", () => {
  it("ships Paninimania card backs per opération", () => {
    expect(
      listCuratedBackSources(path.join(leclercCuratedDir(), "cards")).map(
        (row) => row.destRel,
      ),
    ).toEqual([
      "disney25/back.webp",
      "marvel21/back.webp",
      "marvel22/back.webp",
      "marvel23/back.webp",
      "marvel24/back.webp",
    ]);
  });

  it("registers family catalogue-only effect packs", () => {
    expect(leclercMarvelEffectPack.id).toBe("leclerc-marvel");
    expect(leclercDisneyEffectPack.id).toBe("leclerc-disney");
    expect(leclercMarvelEffectPack.listMaterials()).toEqual([]);
    expect(leclercDisneyEffectPack.resolveMaterial("foil", null)).toBeNull();
  });
});
