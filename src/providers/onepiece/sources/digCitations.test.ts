import { describe, expect, it } from "vitest";

import {
  onepiecePrintFacts,
  onepieceSealedDistributionCitation,
  resetOnepieceDigCitationCaches,
} from "./digCitations";

describe("onepiece digCitations", () => {
  resetOnepieceDigCitationCaches();

  it("stamps ST-01 sealed SKU to Tier One Pieces deep link", () => {
    const hit = onepieceSealedDistributionCitation(
      "starter-deck-01-straw-hat-crew",
    );
    expect(hit?.url).toBe(
      "https://tier-one-onepiece.jp/blog/st01-cardlists/",
    );
    expect(hit?.label).toMatch(/ST01/i);
    expect(
      onepieceSealedDistributionCitation("random-booster-something"),
    ).toBeNull();
  });

  it("stamps ST01 deck prints as Insert starter with proof", () => {
    const facts = onepiecePrintFacts(
      {
        printKey: "onepiece:st01-001",
        setCode: "st01",
        number: "001",
        cardType: "st01",
        grouping: null,
        category: null,
        lang: "en",
        fullName: "Luffy",
        rarity: null,
        art: null,
        thumb: null,
        back: null,
      },
      "onepiece",
    );
    expect(facts[0]).toMatchObject({
      label: "Insert starter",
      url: "https://tier-one-onepiece.jp/blog/st01-cardlists/",
    });
    expect(
      onepiecePrintFacts(
        {
          printKey: "onepiece:op01-001",
          setCode: "op01",
          number: "001",
          cardType: "op01",
          grouping: null,
          category: null,
          lang: "en",
          fullName: "Booster",
          rarity: null,
          art: null,
          thumb: null,
          back: null,
        },
        "onepiece",
      ),
    ).toEqual([]);
  });

  it("stamps ST19–28 Tier One harvest onto starter SKUs + Insert qty maps", () => {
    expect(
      onepieceSealedDistributionCitation(
        "st19-deck-pour-debutant-noir-smoker",
      )?.url,
    ).toBe("https://tier-one-onepiece.jp/blog/st19_cardlists/");
    expect(
      onepieceSealedDistributionCitation(
        "japanese-starter-deck-st19-smoker",
      )?.url,
    ).toContain("st19_cardlists");
    expect(
      onepieceSealedDistributionCitation(
        "booster-fete-decks-debutants-st23-st28-participation",
      ),
    ).toBeNull();

    const insert = onepiecePrintFacts(
      {
        printKey: "onepiece:st19-001",
        setCode: "st19",
        number: "001",
        cardType: "st19",
        grouping: null,
        category: null,
        lang: "en",
        fullName: "Smoker",
        rarity: null,
        art: null,
        thumb: null,
        back: null,
      },
      "onepiece",
    );
    expect(insert[0]?.url).toContain("st19_cardlists");
  });

  it("bridges ST29 dig URL onto sealed SKU + Insert via products-contents", () => {
    const sealed = onepieceSealedDistributionCitation(
      "st29-deck-de-demarrage-egg-head",
    );
    expect(sealed?.url).toBe(
      "https://tier-one-onepiece.jp/blog/st29-card-list/",
    );
    expect(sealed?.label).toMatch(/ST29/i);

    const facts = onepiecePrintFacts(
      {
        printKey: "onepiece:st29-001",
        setCode: "st29",
        number: "001",
        cardType: "st29",
        grouping: null,
        category: null,
        lang: "fr",
        fullName: "Sample",
        rarity: null,
        art: null,
        thumb: null,
        back: null,
      },
      "onepiece",
    );
    expect(facts[0]?.url).toBe(
      "https://tier-one-onepiece.jp/blog/st29-card-list/",
    );
  });

  it("stamps ST36 sealed Distribution without inventing Pieces Insert", () => {
    const sealed = onepieceSealedDistributionCitation(
      "st36-deck-pour-debutant-eustass-captain-kidd-jaune",
    );
    expect(sealed?.url).toBe(
      "https://tier-one-onepiece.jp/blog/st36-card-list/",
    );
    expect(sealed?.label).toMatch(/sans table Pieces/i);
    expect(
      onepiecePrintFacts(
        {
          printKey: "onepiece:st36-001",
          setCode: "st36",
          number: "001",
          cardType: "st36",
          grouping: null,
          category: null,
          lang: "fr",
          fullName: "Kidd",
          rarity: null,
          art: null,
          thumb: null,
          back: null,
        },
        "onepiece",
      ),
    ).toEqual([]);
  });
});


