import path from "node:path";
import { describe, expect, it } from "vitest";

import { digimonEffectPack } from "@/effects/digimon";
import { listCuratedBackSources } from "@/providers/shared/curatedCardsInstall";

import { digimonModule } from "./index";
import { digimonCuratedDir } from "./pack";

describe("digimon provider hooks", () => {
  it("declares an empty local catalogue surface", () => {
    expect(digimonModule.info.id).toBe("digimon");
    expect(digimonModule.catalog?.dataPack).toBe("digimon");
    expect(digimonModule.searchPrints).toBeTypeOf("function");
    expect(digimonModule.lookupPrint).toBeTypeOf("function");
    expect(digimonModule.info.nameDatabase).toBe(true);
    expect(digimonModule.printGames).toEqual(["digimon"]);
  });

  it("does not claim foreign printKeys", async () => {
    await expect(
      digimonModule.lookupPrint!({ printKey: "lorcana:6-48" }),
    ).resolves.toBeNull();
    await expect(
      digimonModule.lookupPrint!({ printKey: "pokemon:sv1-001" }),
    ).resolves.toBeNull();
  });
});

describe("digimon curated back", () => {
  it("does not ship a made-up back", () => {
    expect(
      listCuratedBackSources(path.join(digimonCuratedDir(), "cards")).map(
        (row) => row.destRel,
      ),
    ).toEqual([]);
  });

  it("registers a catalogue-only effect pack", () => {
    expect(digimonEffectPack.id).toBe("digimon");
    expect(digimonEffectPack.listMaterials()).toEqual([]);
    expect(digimonEffectPack.resolveMaterial("foil", null)).toBeNull();
  });
});
