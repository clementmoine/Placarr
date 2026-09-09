import path from "node:path";
import { describe, expect, it } from "vitest";

import { mtgEffectPack } from "@/effects/mtg";
import { listCuratedBackSources } from "@/providers/shared/curatedCardsInstall";

import { mtgModule } from "./index";
import { mtgCuratedDir } from "./pack";

describe("mtg provider hooks", () => {
  it("declares an empty local catalogue surface", () => {
    expect(mtgModule.info.id).toBe("mtg");
    expect(mtgModule.catalog?.dataPack).toBe("mtg");
    expect(mtgModule.searchPrints).toBeTypeOf("function");
    expect(mtgModule.lookupPrint).toBeTypeOf("function");
    expect(mtgModule.info.nameDatabase).toBe(true);
    expect(mtgModule.printGames).toEqual(["mtg"]);
  });

  it("does not claim foreign printKeys", async () => {
    await expect(
      mtgModule.lookupPrint!({ printKey: "lorcana:6-48" }),
    ).resolves.toBeNull();
    await expect(
      mtgModule.lookupPrint!({ printKey: "pokemon:sv1-001" }),
    ).resolves.toBeNull();
  });
});

describe("mtg curated back", () => {
  it("does not ship a made-up back", () => {
    expect(
      listCuratedBackSources(path.join(mtgCuratedDir(), "cards")).map(
        (row) => row.destRel,
      ),
    ).toEqual([]);
  });

  it("registers a catalogue-only effect pack", () => {
    expect(mtgEffectPack.id).toBe("mtg");
    expect(mtgEffectPack.listMaterials()).toEqual([]);
    expect(mtgEffectPack.resolveMaterial("foil", null)).toBeNull();
  });
});
