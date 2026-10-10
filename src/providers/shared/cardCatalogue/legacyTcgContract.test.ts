/**
 * Inherited full packs (pre–LocalTcgLine) must still expose the same app
 * surface as createLocalTcgLine: search, lookup, sets, catalog, printGames.
 */
import { describe, expect, it } from "vitest";

import { PROVIDER_MODULES } from "@/core/catalog/catalog";

const LEGACY_LOCAL_TCG_IDS = [
  "narutocarddass",
  "lorcanatcg",
  "pokemontcglive",
  "dbscg",
  "dbsfw",
] as const;

describe("legacy TCG pack contract", () => {
  it.each(LEGACY_LOCAL_TCG_IDS)(
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
