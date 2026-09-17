import { describe, expect, it } from "vitest";

import { mergeGgClassicTitlesIntoIndex } from "./scrapeNarutoCardGameGg";

describe("mergeGgClassicTitlesIntoIndex", () => {
  const prints = [
    {
      printKey: "naruto:nc-0001",
      setCode: "quest",
      number: "nc0001",
      cardType: "nc",
    },
    {
      printKey: "naruto:ex-0001",
      setCode: "promo",
      number: "ex0001",
      cardType: "ex",
    },
  ];

  it("fills EN names from GG slug when missing", () => {
    const merged = mergeGgClassicTitlesIntoIndex({
      prints,
      titles: [],
      cards: [
        {
          prefix: "nc",
          number: "nc0001",
          set: "quest-for-power",
          slug: "naruto-uzumaki",
          rawId: "nc001",
          line: "classic-ccg",
        },
        {
          prefix: "ex",
          number: "ex0001",
          set: "promo",
          slug: "naruto-uzumaki",
          rawId: "ex001",
          line: "classic-ccg",
        },
      ],
    });
    expect(merged.titled).toEqual(["naruto:ex-0001", "naruto:nc-0001"]);
    expect(
      merged.titles.find(
        (t) => t.printKey === "naruto:nc-0001" && t.lang === "en",
      )?.fullName,
    ).toBe("Naruto Uzumaki");
  });

  it("does not overwrite an existing EN title", () => {
    const merged = mergeGgClassicTitlesIntoIndex({
      prints,
      titles: [
        {
          printKey: "naruto:nc-0001",
          lang: "en",
          fullName: "Keep Me",
        },
      ],
      cards: [
        {
          prefix: "nc",
          number: "nc0001",
          set: "quest-for-power",
          slug: "naruto-uzumaki",
          rawId: "nc001",
          line: "classic-ccg",
        },
      ],
    });
    expect(merged.titled).toEqual([]);
    expect(
      merged.titles.find((t) => t.printKey === "naruto:nc-0001")?.fullName,
    ).toBe("Keep Me");
  });

  it("does not mint prints absent from the index", () => {
    const merged = mergeGgClassicTitlesIntoIndex({
      prints: [],
      titles: [],
      cards: [
        {
          prefix: "nc",
          number: "nc0001",
          set: "quest-for-power",
          slug: "naruto-uzumaki",
          rawId: "nc001",
          line: "classic-ccg",
        },
      ],
    });
    expect(merged.prints).toEqual([]);
    expect(merged.titled).toEqual([]);
  });
});
