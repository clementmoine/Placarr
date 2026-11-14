import { existsSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { priceProbeContext } from "@/providers/shared/createPrintKeyPriceModule";
import { dbscardsIndexPath } from "@/providers/shared/tcgcards/scrapeList";

import { dbsmarketModule } from "./index";
import {
  loadDbscardsPriceIndex,
  loadDbscardsPriceIndexFromDisk,
  resetDbscardsPriceIndexCache,
} from "./fetch";

const hasMastersDump = existsSync(dbscardsIndexPath("dragonball/cg", "fr"));

/**
 * The local dump is whatever the last scrape kept (a partial refresh may carry
 * only recent sets) — probe a priced Masters card that is actually in it
 * instead of pinning a printKey the dump may not contain.
 */
const mastersSample = hasMastersDump
  ? Object.values(loadDbscardsPriceIndexFromDisk()).find(
      (card) =>
        card.printKey.startsWith("dbscg:") &&
        card.priceCents > 0 &&
        card.name.trim().length > 0,
    )
  : undefined;

describe("dbsmarketModule info", () => {
  it("is a reference EUR price source for DBS", () => {
    expect(dbsmarketModule.info.id).toBe("dbsmarket");
    expect(dbsmarketModule.info.types).toContain("tcg");
    expect(dbsmarketModule.info.capabilities).toContain("price");
    expect(dbsmarketModule.info.referencePriceSource).toBe(true);
    expect(dbsmarketModule.info.evidenceOnlyPriceRefresh).toBe(true);
    expect(dbsmarketModule.info.supplyMode).toBe("scrape_cache");
  });
});

describe("dbsmarketModule.refreshBarcodePriceOffers", () => {
  beforeEach(() => {
    resetDbscardsPriceIndexCache();
  });

  afterEach(() => {
    resetDbscardsPriceIndexCache();
  });

  it("ignores non-DBS printKeys", async () => {
    const offers = await dbsmarketModule.refreshBarcodePriceOffers!(
      priceProbeContext({
        printKey: "lorcana:1-1",
        name: "Ariel",
      }),
    );
    expect(offers).toEqual([]);
  });

  it.skipIf(!mastersSample)(
    "emits a metadata-scoped EUR offer from the local Masters dump",
    async () => {
      const offers = await dbsmarketModule.refreshBarcodePriceOffers!(
        priceProbeContext({
          printKey: mastersSample!.printKey,
          name: mastersSample!.name,
        }),
      );
      expect(offers.length).toBeGreaterThan(0);
      expect(offers[0]).toMatchObject({
        source: "dbscards",
        condition: "new",
        currency: "EUR",
        metadataScoped: true,
      });
      expect(offers[0]!.priceCents).toBeGreaterThan(0);
    },
  );
});

describe("loadDbscardsPriceIndex evidenceOnly", () => {
  beforeEach(() => {
    resetDbscardsPriceIndexCache();
  });

  it("returns empty when cold and evidenceOnly", async () => {
    const index = await loadDbscardsPriceIndex({ evidenceOnly: true });
    expect(index).toEqual({});
  });
});
