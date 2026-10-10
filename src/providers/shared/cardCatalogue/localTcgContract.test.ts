/**
 * Contract for local TCG catalogue lines built via createLocalTcgLine /
 * createEmptyLocalTcgProvider. A new pack that uses the factory must expose
 * this surface without inventing core branches.
 *
 * Inherited packs (lorcanatcg, pokemontcglive, dbscg, dbsfw, narutocarddass)
 * converge separately — see docs/tcg_new_pack.md.
 */
import { describe, expect, it } from "vitest";

import { PROVIDER_MODULES } from "@/core/catalog/catalog";
import type { ProviderModule } from "@/types/providerModule";

/** Factory-based local catalogue lines (not the five legacy pack owners). */
const FACTORY_LOCAL_TCG_IDS = new Set([
  "bleachscb",
  "dbh",
  "dbslamincards",
  "dbsjcc",
  "leclercdisney25",
  "leclercmarvel21",
  "leclercmarvel22",
  "leclercmarvel23",
  "leclercmarvel24",
  "mtg",
  "narutodatacarddass",
  "narutokayou",
  "narutomythos",
  "narutoranks",
  "narutoshippuden",
  "narutoultra",
  "onepiece",
  "yugioh",
]);

function factoryLocalTcgModules(): ProviderModule[] {
  return PROVIDER_MODULES.filter((mdl) =>
    FACTORY_LOCAL_TCG_IDS.has(mdl.info.id),
  );
}

describe("local TCG factory contract", () => {
  it("lists every factory-based local TCG module", () => {
    const found = new Set(factoryLocalTcgModules().map((m) => m.info.id));
    expect([...FACTORY_LOCAL_TCG_IDS].sort()).toEqual([...found].sort());
  });

  it.each([...FACTORY_LOCAL_TCG_IDS].sort())(
    "%s exposes search / lookup / sets / catalog / printGames",
    (id) => {
      const mdl = PROVIDER_MODULES.find((row) => row.info.id === id);
      expect(mdl).toBeTruthy();
      expect(mdl!.info.supplyMode).toBe("local_catalog");
      expect(mdl!.info.types).toContain("tcg");
      expect(mdl!.searchPrints).toBeTypeOf("function");
      expect(mdl!.lookupPrint).toBeTypeOf("function");
      expect(mdl!.listPrintSets).toBeTypeOf("function");
      expect(mdl!.listSetPrints).toBeTypeOf("function");
      expect(mdl!.catalog?.dataPack).toBeTruthy();
      expect(mdl!.catalog?.refresh).toBeTypeOf("function");
      expect(mdl!.catalog?.status).toBeTruthy();
      expect(mdl!.printGames?.length).toBeGreaterThan(0);
    },
  );
});
