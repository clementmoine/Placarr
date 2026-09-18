import { existsSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { priceProbeContext } from "@/providers/shared/createPrintKeyPriceModule";
import { dbscardsIndexPath } from "@/providers/dragonball/shared/dbscards/scrapeList";

import { dbsmarketModule } from "./index";
import {
  loadDbscardsPriceIndex,
  resetDbscardsPriceIndexCache,
} from "./fetch";

const hasMastersDump = existsSync(dbscardsIndexPath("dbs/cg", "fr"));

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

  it.skipIf(!hasMastersDump)(
    "emits a metadata-scoped EUR offer from the local Masters dump",
    async () => {
      const offers = await dbsmarketModule.refreshBarcodePriceOffers!(
        priceProbeContext({
          printKey: "dbscg:bt2-103",
          name: "Frappe cruelle de Freezer",
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
