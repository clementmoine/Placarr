import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  leclercDisneyEffectPack,
  leclercMarvelEffectPack,
  leclercStarWarsEffectPack,
} from "@/effects/leclerc";
import { listCuratedBackSources } from "@/providers/shared/curatedCardsInstall";

import {
  buildLeclercFromLedgers,
  leclercNameDensifyGate,
  readLeclercChecklistForSet,
} from "./buildFromLedgers";
import { colekaLeclercListingForSet } from "./parseColekaLeclerc";
import {
  leclercDisney25Module,
  leclercDisney26Module,
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
    expect(leclercDisney26Module.catalog?.dataPack).toBe("leclerc/disney26");
    expect(leclercMarvel21Module.printGames).toEqual(["leclerc"]);
    expect(leclercDisney25Module.printGames).toEqual(["leclerc"]);
    expect(leclercDisney26Module.printGames).toEqual(["leclerc"]);
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
    expect(leclercSetLabel("disney26")).toBe(
      "2026 Disney: Le Monde avec Disney",
    );
    expect(leclercSetLabel("sw19sb")).toBe(
      "2019 Star Wars: Maîtriser la Force",
    );
    expect(leclercSetLabel("marvel20sb")).toBe(
      "2020 Marvel: Deviens un Héros",
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
    const disney26 = buildLeclercFromLedgers({
      setCode: "disney26",
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
    expect(disney26.sets).toEqual(["disney26"]);
    expect(disney26.prints).toBe(132);
    expect(disney26.placeholders).toBe(132);
    expect(marvel24.prints).toBe(132);
    expect(marvel24.placeholders).toBe(0);
  });

  it("gates disney26 name densify until Coleka / album evidence (no invent)", () => {
    expect(colekaLeclercListingForSet("disney26")).toBeNull();
    const gate = leclercNameDensifyGate("disney26");
    expect(gate.ready).toBe(false);
    expect(gate.named).toBe(0);
    expect(gate.stubs).toBe(132);
    expect(gate.reasons).toEqual(
      expect.arrayContaining([
        "pas de listing Coleka",
        "checklist stub-only — ne pas inventer de noms",
      ]),
    );
    const ledger = readLeclercChecklistForSet("disney26");
    expect(ledger?.cards.every((c) => Boolean(c.note))).toBe(true);
    expect(ledger?.cards.every((c) => /^Carte #|^Fixeez #/i.test(c.name))).toBe(
      true,
    );
    // Named ops stay ungated.
    expect(leclercNameDensifyGate("disney25").ready).toBe(true);
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
    expect(leclercStarWarsEffectPack.id).toBe("leclerc-starwars");
    expect(leclercMarvelEffectPack.listMaterials()).toEqual([]);
    expect(leclercDisneyEffectPack.resolveMaterial("foil", null)).toBeNull();
  });
});
