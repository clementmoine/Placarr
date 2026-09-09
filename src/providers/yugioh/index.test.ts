import path from "node:path";
import { describe, expect, it } from "vitest";

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
});

describe("yugioh curated back", () => {
  it("does not ship a made-up back", () => {
    expect(
      listCuratedBackSources(path.join(yugiohCuratedDir(), "cards")).map(
        (row) => row.destRel,
      ),
    ).toEqual([]);
  });

  it("registers a catalogue-only effect pack", () => {
    expect(yugiohEffectPack.id).toBe("yugioh");
    expect(yugiohEffectPack.listMaterials()).toEqual([]);
    expect(yugiohEffectPack.resolveMaterial("foil", null)).toBeNull();
  });
});
