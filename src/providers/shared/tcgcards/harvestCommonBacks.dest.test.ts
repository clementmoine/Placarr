import { describe, expect, it } from "vitest";

import { packCardsDir } from "@/lib/packPaths";
import { tcgCardsSite } from "@/providers/shared/tcgcards/sites";

/**
 * ADR-006 / syncables : CDN backs install under data/<pack>/cards, never curated.
 * harvestTcgCardsDistinctBacks uses packCardsDir(site.packId) when dataCardsDir
 * is omitted — lock that composition so a future curatedDir regression fails CI.
 */
describe("harvestTcgCardsDistinctBacks destination", () => {
  it.each(["opecards", "ygocards", "lorcards"] as const)(
    "%s pack cards dir is under data/, not curated/",
    (siteId) => {
      const site = tcgCardsSite(siteId);
      expect(site.packId).toBeTruthy();
      const dest = packCardsDir(site.packId!);
      expect(dest).toMatch(/[/\\]data[/\\]/);
      expect(dest).toMatch(/[/\\]cards$/);
      expect(dest).not.toMatch(/curated/);
    },
  );
});
