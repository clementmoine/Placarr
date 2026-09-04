import path from "node:path";
import { describe, expect, it } from "vitest";

import { narutoDefiNinjaEffectPack } from "@/effects/narutodefininja";
import { listCuratedBackSources } from "@/providers/shared/curatedCardsInstall";

import { narutodefininjaModule } from "./index";
import { narutoDefiNinjaCuratedDir } from "./pack";
import {
  buildDefiNinjaFromLedgers,
  readDefiNinjaChecklist,
} from "./buildFromLedgers";
import {
  defiNinjaPrintKey,
  formatDefiNinjaReference,
  normalizeDefiNinjaSearchQuery,
} from "./printKey";
import { readDefiNinjaProductsLedger } from "./sealedProducts";

describe("narutodefininja provider hooks", () => {
  it("declares a Défi Ninja local catalogue surface", () => {
    expect(narutodefininjaModule.info.id).toBe("narutodefininja");
    expect(narutodefininjaModule.catalog?.dataPack).toBe("naruto/defi-ninja");
    expect(narutodefininjaModule.searchPrints).toBeTypeOf("function");
    expect(narutodefininjaModule.printGames).toEqual(["definija"]);
    expect(narutodefininjaModule.info.catalogueLabel).toBe("Naruto Défi Ninja");
  });

  it("does not claim foreign printKeys", async () => {
    await expect(
      narutodefininjaModule.lookupPrint!({ printKey: "naruto:ni-0001" }),
    ).resolves.toBeNull();
    await expect(
      narutodefininjaModule.lookupPrint!({ printKey: "mythos:ks1-0001" }),
    ).resolves.toBeNull();
  });
});

describe("checklist Défi Ninja", () => {
  it("seeds 50 numbered stubs and the sealed EAN", () => {
    const ledger = readDefiNinjaChecklist();
    expect(ledger.set.cardCount).toBe(50);
    expect(ledger.cards).toHaveLength(50);
    expect(ledger.ean).toBe("9791032407592");
    const report = buildDefiNinjaFromLedgers({ dryRun: true });
    expect(report.prints).toBe(50);
    expect(report.skipped).toEqual([]);
    expect(readDefiNinjaProductsLedger().ean).toBe("9791032407592");
  });

  it("frappe le jeu definija", () => {
    expect(defiNinjaPrintKey("01")).toBe("definija:main-01");
    expect(formatDefiNinjaReference("main", "7")).toBe("07");
    expect(normalizeDefiNinjaSearchQuery("7")).toBe("07");
  });
});

describe("narutodefininja curated back", () => {
  it("ships a pack back placeholder", () => {
    expect(
      listCuratedBackSources(
        path.join(narutoDefiNinjaCuratedDir(), "cards"),
      ).map((row) => row.destRel),
    ).toEqual(["back.webp"]);
  });

  it("registers a catalogue-only effect pack", () => {
    expect(narutoDefiNinjaEffectPack.id).toBe("naruto-defi-ninja");
    expect(narutoDefiNinjaEffectPack.listMaterials()).toEqual([]);
  });
});
