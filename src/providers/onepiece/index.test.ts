import path from "node:path";
import { describe, expect, it } from "vitest";

import { onepieceEffectPack } from "@/effects/onepiece";
import { listCuratedBackSources } from "@/providers/shared/curatedCardsInstall";

import { onepieceModule } from "./index";
import { onepieceCuratedDir } from "./pack";

describe("onepiece provider hooks", () => {
  it("declares an empty local catalogue surface", () => {
    expect(onepieceModule.info.id).toBe("onepiece");
    expect(onepieceModule.catalog?.dataPack).toBe("onepiece");
    expect(onepieceModule.searchPrints).toBeTypeOf("function");
    expect(onepieceModule.lookupPrint).toBeTypeOf("function");
    expect(onepieceModule.info.nameDatabase).toBe(true);
    expect(onepieceModule.printGames).toEqual(["onepiece"]);
  });

  it("does not claim foreign printKeys", async () => {
    await expect(
      onepieceModule.lookupPrint!({ printKey: "lorcana:6-48" }),
    ).resolves.toBeNull();
    await expect(
      onepieceModule.lookupPrint!({ printKey: "pokemon:sv1-001" }),
    ).resolves.toBeNull();
  });

  it("skips sealed products on automatic catalogue refresh", async () => {
    const ran: string[][] = [];
    const { cardCatalogueHooks } = await import(
      "@/providers/shared/cardCatalogue/pipeline"
    );
    const hooks = cardCatalogueHooks({
      packId: "onepiece",
      dbPath: () => "/tmp/missing-onepiece.sqlite",
      runPipeline: async (argv) => {
        ran.push([...argv]);
      },
      autoSkip: ["products"],
    });
    await hooks.refresh({ auto: true });
    expect(ran[0]).toEqual(["--skip", "products"]);
  });
});

describe("onepiece curated back", () => {
  it("ships attested category backs from opecards.fr", () => {
    expect(
      listCuratedBackSources(path.join(onepieceCuratedDir(), "cards")).map(
        (row) => row.destRel,
      ),
    ).toEqual(["back.don.webp", "back.leader.webp", "back.webp"]);
  });

  it("registers a catalogue-only effect pack", () => {
    expect(onepieceEffectPack.id).toBe("onepiece");
    expect(onepieceEffectPack.listMaterials()).toEqual([]);
    expect(onepieceEffectPack.resolveMaterial("foil", null)).toBeNull();
  });
});
