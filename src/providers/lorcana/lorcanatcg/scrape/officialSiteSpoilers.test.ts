import { describe, expect, it } from "vitest";

import { normalizeLorcanaSearchText } from "@/providers/lorcana/lorcanajson/fetch";
import {
  officialSetIdToSetCode,
  parseOfficialSpoilerTitle,
  type OfficialProductPage,
} from "./officialSite";
import { matchOfficialSpoilersToPrints } from "./officialSiteSpoilers";

describe("parseOfficialSpoilerTitle", () => {
  it("strip le préfixe Disney Lorcana et normalise le tiret", () => {
    expect(
      parseOfficialSpoilerTitle(
        "Disney Lorcana Miguel Rivera - Musicien de rue",
      ),
    ).toBe("Miguel Rivera - Musicien de rue");
    expect(parseOfficialSpoilerTitle("Aurora -Delightful Musician")).toBe(
      "Aurora - Delightful Musician",
    );
  });

  it("refuse playmats / chrome", () => {
    expect(parseOfficialSpoilerTitle("Playmat Rapunzel")).toBeNull();
    expect(parseOfficialSpoilerTitle("Hyperia City")).toBeNull();
  });
});

describe("officialSetIdToSetCode", () => {
  it("mappe set / quest / gateway", () => {
    expect(officialSetIdToSetCode("set14")).toBe("14");
    expect(officialSetIdToSetCode("quest3")).toBe("Q3");
    expect(officialSetIdToSetCode("gateway1")).toBe("G1");
    expect(officialSetIdToSetCode(null)).toBeNull();
  });
});

describe("matchOfficialSpoilersToPrints", () => {
  const titles = [
    {
      printKey: "lorcana:14-19",
      setCode: "14",
      lang: "en",
      searchName: normalizeLorcanaSearchText("Aurora - Delightful Musician"),
      fullName: "Aurora - Delightful Musician",
    },
    {
      printKey: "lorcana:14-11",
      setCode: "14",
      lang: "en",
      searchName: normalizeLorcanaSearchText(
        "Nick Wilde - Inquisitive Harbormaster",
      ),
      fullName: "Nick Wilde - Inquisitive Harbormaster",
    },
  ];

  const page = (spoilers: OfficialProductPage["spoilers"]): OfficialProductPage => ({
    slug: "hyperia-city",
    title: "Hyperia City",
    logoUrl: null,
    logoAlt: null,
    setId: "set14",
    packshots: [],
    spoilers,
    sourceUrl: "https://www.disneylorcana.com/fr-FR/product/hyperia-city",
    lang: "fr",
  });

  it("ancre Aurora et Harbormaster (espace vs collé)", () => {
    const { matches, unmatched } = matchOfficialSpoilersToPrints(
      [
        page([
          {
            url: "https://example.test/aurora.png",
            title: "Aurora - Delightful Musician",
            kind: "reveal",
          },
          {
            url: "https://example.test/nick.png",
            title: "Nick Wilde - Inquisitive Harbor master",
            kind: "reveal",
          },
          {
            url: "https://example.test/miguel.png",
            title: "Miguel Rivera - Musicien de rue",
            kind: "first-look",
          },
        ]),
      ],
      titles,
    );
    expect(matches.map((m) => m.printKey).sort()).toEqual([
      "lorcana:14-11",
      "lorcana:14-19",
    ]);
    expect(unmatched.map((u) => u.title)).toEqual([
      "Miguel Rivera - Musicien de rue",
    ]);
  });

  it("n'invente pas de clé si le titre matche deux tirages", () => {
    const { matches, unmatched } = matchOfficialSpoilersToPrints(
      [
        page([
          {
            url: "https://example.test/x.png",
            title: "Aurora - Delightful Musician",
            kind: "reveal",
          },
        ]),
      ],
      [
        ...titles,
        {
          printKey: "lorcana:14-999",
          setCode: "14",
          lang: "fr",
          searchName: normalizeLorcanaSearchText(
            "Aurora - Delightful Musician",
          ),
          fullName: "Aurora - Delightful Musician",
        },
      ],
    );
    // Même searchName, deux printKeys différents → ambigu.
    expect(matches).toHaveLength(0);
    expect(unmatched).toHaveLength(1);
  });
});
