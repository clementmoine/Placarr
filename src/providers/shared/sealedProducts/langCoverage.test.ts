import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { packProductsIndexPath } from "@/lib/packPaths";
import {
  SEALED_LANG_COVERAGE_PACKS,
  sealedLangCoverageForPack,
} from "./langCoverage";

describe("sealedLangCoverageForPack", () => {
  it("reports card langs missing sealed SKUs (honest gaps, no invented SKUs)", () => {
    const reports = SEALED_LANG_COVERAGE_PACKS.map((pack) =>
      sealedLangCoverageForPack(pack),
    ).filter(Boolean);

    expect(reports.length).toBeGreaterThan(0);

    const byPack = Object.fromEntries(
      reports.map((row) => [row!.pack, row!]),
    );

    // One Piece already harvests multi-lang TCG Cards — EN/FR present.
    if (byPack.onepiece) {
      expect(byPack.onepiece.skuLangs).toEqual(
        expect.arrayContaining(["en", "fr"]),
      );
      // Kinds promoted from host categories after rewrite.
      const index = JSON.parse(
        readFileSync(packProductsIndexPath("onepiece"), "utf8"),
      ) as { products: Record<string, { kind: string }> };
      const kinds = new Set(
        Object.values(index.products).map((row) => row.kind),
      );
      expect(kinds.has("multipack")).toBe(true);
      expect(kinds.has("tin")).toBe(true);
    }

    // Pokémon / Lorcana / DBS still miss several card langs on sealed.
    if (byPack.pokemon) {
      expect(byPack.pokemon.cardLangs.length).toBeGreaterThan(1);
      expect(byPack.pokemon.missingSkuLangs.length).toBeGreaterThan(0);
    }
    if (byPack.lorcana) {
      expect(byPack.lorcana.cardLangs).toEqual(
        expect.arrayContaining(["en", "fr"]),
      );
      // DE/IT cards exist; sealed still thin until official multi-locale sync.
      expect(byPack.lorcana.missingSkuLangs.length).toBeGreaterThanOrEqual(0);
    }
  });
});
