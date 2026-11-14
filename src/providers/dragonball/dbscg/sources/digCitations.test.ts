import { describe, expect, it } from "vitest";

import {
  dbsCgDigPrintFacts,
  dbsCgSd08InsertCitationForPrintKey,
  dbsCgSealedDistributionCitation,
  resetDbsCgDigCitationCaches,
} from "./digCitations";

describe("dbscg digCitations", () => {
  resetDbsCgDigCitationCaches();

  it("stamps SD08 sealed SKU to Bandai Asia product page", () => {
    const hit = dbsCgSealedDistributionCitation("sd08-rising-broly");
    expect(hit?.url).toBe(
      "https://www.dbs-cardgame.com/asia/product/dbs-sd08.php",
    );
  });

  it("stamps other curated Bandai product pages from products-contents", () => {
    expect(dbsCgSealedDistributionCitation("sd01-the-awakening")?.url).toBe(
      "https://www.dbs-cardgame.com/asia/product/dbs-sd01.php",
    );
    expect(
      dbsCgSealedDistributionCitation("random-staging-only-sku"),
    ).toBeNull();
  });


  it("stamps SD8 exclusives as Insert starter with product proof", () => {
    expect(dbsCgSd08InsertCitationForPrintKey("dbscg:sd8-01")?.label).toBe(
      "Insert starter",
    );
    expect(dbsCgDigPrintFacts("dbscg:sd8-10", "dbscg")[0]?.url).toContain(
      "dbs-sd08.php",
    );
    expect(dbsCgSd08InsertCitationForPrintKey("dbscg:bt1-001")).toBeNull();
  });
});
