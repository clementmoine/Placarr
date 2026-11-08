import { describe, expect, it } from "vitest";

import {
  bleachScbPrintFacts,
  bleachScbS1CatalogueCitationUrl,
  bleachScbSealedDistributionCitation,
  resetBleachScbDigCitationCaches,
} from "./digCitations";

describe("bleachscb digCitations", () => {
  resetBleachScbDigCitationCaches();

  it("opens S1 catalogue via Wayback deep link (not carddass hub)", () => {
    const url = bleachScbS1CatalogueCitationUrl();
    expect(url).toContain("web.archive.org/web/");
    expect(url).toContain("catalogue_S1_Bleach.html");
    expect(url).not.toMatch(/carddass\.fr\/bleach\/?$/i);
  });

  it("stamps Compagnons / Rivaux sealed SKUs to S1 catalogue proof", () => {
    expect(bleachScbSealedDistributionCitation("starter-compagnons")?.label).toContain(
      "Compagnons",
    );
    expect(bleachScbSealedDistributionCitation("starter-rivaux")?.url).toContain(
      "catalogue_S1_Bleach.html",
    );
    expect(
      bleachScbSealedDistributionCitation("display-s1-shinigami-and-ichigo"),
    ).toBeNull();
  });

  it("stamps Compagnons guaranteed prints as Insert starter", () => {
    const facts = bleachScbPrintFacts(
      {
        printKey: "bleachscb:a-002",
        setCode: "a",
        number: "002",
        cardType: "a",
        grouping: null,
        category: null,
        lang: "fr",
        fullName: "Sample",
        rarity: null,
        art: null,
        thumb: null,
      },
      "bleachscb",
    );
    expect(facts[0]).toMatchObject({
      label: "Insert starter",
      value: expect.stringMatching(/Compagnons/i),
    });
    expect(facts[0]?.url).toContain("catalogue_S1_Bleach.html");

    expect(
      bleachScbPrintFacts(
        {
          printKey: "bleachscb:s-002",
          setCode: "s",
          number: "002",
          cardType: "s",
          grouping: null,
          category: null,
          lang: "ja",
          fullName: "JA only",
          rarity: null,
          art: null,
          thumb: null,
        },
        "bleachscb",
      ),
    ).toEqual([]);
  });
});
