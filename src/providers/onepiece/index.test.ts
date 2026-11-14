import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { onepieceEffectPack } from "@/effects/onepiece";
import { packCardsDir } from "@/lib/packPaths";
import { listCuratedBackSources } from "@/providers/shared/curatedCardsInstall";

import { onepieceModule } from "./index";
import { ONEPIECE_PACK_ID, onepieceCuratedDir } from "./pack";

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

  it("automatic catalogue refresh runs the full pipeline (no product skip)", async () => {
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
    });
    await hooks.refresh({ auto: true });
    expect(ran[0]).toEqual([]);
  });
});

describe("onepiece pack backs", () => {
  it("ships attested category backs under data/ (CDN-recoverable, not curated)", () => {
    const dir = packCardsDir(ONEPIECE_PACK_ID);
    for (const name of ["back.don.webp", "back.leader.webp", "back.webp"]) {
      expect(existsSync(path.join(dir, name)), path.join(dir, name)).toBe(true);
    }
    // Curated no longer mirrors URL-recoverable sleeves (ADR-006).
    expect(
      listCuratedBackSources(path.join(onepieceCuratedDir(), "cards")),
    ).toEqual([]);
  });

  it("registers a catalogue-only effect pack", () => {
    expect(onepieceEffectPack.id).toBe("onepiece");
    expect(onepieceEffectPack.listMaterials()).toEqual([]);
    expect(onepieceEffectPack.resolveMaterial("foil", null)).toBeNull();
  });
});
