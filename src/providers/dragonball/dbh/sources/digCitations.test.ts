import { describe, expect, it } from "vitest";

import {
  dbhNamekInsertCitationForPrint,
  dbhPrintFacts,
  dbhSealedDistributionCitation,
  resetDbhDigCitationCaches,
} from "./digCitations";

describe("dbh digCitations", () => {
  resetDbhDigCitationCaches();

  it("stamps Namek starter sealed SKU to official carddass product page", () => {
    const hit = dbhSealedDistributionCitation("starter-pack-namek-battle");
    expect(hit?.url).toContain(
      "carddass.com/dbh/sdbh_ugm/products/starterpack_planet_namek.php",
    );
    expect(dbhSealedDistributionCitation("no-such-sealed-sku")).toBeNull();
  });

  it("stamps Fullahead dig product pages for ultimate booster sealed SKUs", () => {
    expect(
      dbhSealedDistributionCitation("ultimate-booster-new-clash")?.url,
    ).toContain("pt-fullahead.com/shopdetail/000000050213");
    expect(
      dbhSealedDistributionCitation("ultimate-booster-new-clash-box")?.url,
    ).toContain("pt-fullahead.com/shopdetail/000000050128");
    expect(
      dbhSealedDistributionCitation("ultimate-booster-super-warrior")?.url,
    ).toContain("pt-fullahead.com/shopdetail/000000050216");
    expect(
      dbhSealedDistributionCitation("ultimate-booster-super-warrior-box")?.url,
    ).toContain("pt-fullahead.com/shopdetail/000000050129");
    expect(
      dbhSealedDistributionCitation("ultimate-booster-dbh")?.url,
    ).toContain("pt-fullahead.com/shopdetail/000000050141");
    expect(
      dbhSealedDistributionCitation("big-bang-booster-pack-1-box")?.url,
    ).toContain("pt-fullahead.com/shopdetail/000000050132");
  });

  it("stamps Toy-Let / marketplace digs for sealed SKUs missing Fullahead", () => {
    expect(
      dbhSealedDistributionCitation("booster-selection-pack")?.url,
    ).toContain("toy-let.com");
    expect(
      dbhSealedDistributionCitation("big-bang-booster-pack-3-box")?.url,
    ).toMatch(/toy-let\.com|rappcollect\.com|chitoroshop\.com/);
    expect(
      dbhSealedDistributionCitation("extra-booster-pack-1")?.url,
    ).toContain("ebay.com");
    expect(
      dbhSealedDistributionCitation("ultimate-booster-bravery")?.url,
    ).toContain("carddass.com/club");
  });

  it("stamps UGMPS battle cards as Insert starter with proof", () => {
    const insert = dbhNamekInsertCitationForPrint({
      setCode: "ugmps",
      number: "01",
    });
    expect(insert).toMatchObject({
      label: "Insert starter",
      value: expect.stringMatching(/Namek/i),
    });
    expect(insert?.url).toContain("carddass.com");

    const facts = dbhPrintFacts(
      {
        printKey: "dbh:ugmps-03",
        setCode: "ugmps",
        number: "03",
        cardType: "ugmps",
        grouping: null,
        category: null,
        lang: "ja",
        fullName: "Sample",
        rarity: null,
        art: null,
        thumb: null,
      },
      "dbh",
    );
    expect(facts[0]?.label).toBe("Insert starter");
    expect(facts.find((f) => f.kind === "story")?.value).toMatch(
      /バトルカード6枚|アバターカード/i,
    );

    expect(
      dbhNamekInsertCitationForPrint({ setCode: "h1", number: "01" }),
    ).toBeNull();
  });
});
