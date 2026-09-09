import { afterEach, describe, expect, it } from "vitest";

import {
  narutoIndicativeQuoteForPrint,
  resetNarutoIndicativeQuotesCache,
} from "./collectionNarutoIndicativeQuotes";

afterEach(() => {
  resetNarutoIndicativeQuotesCache();
});

describe("narutoIndicativeQuoteForPrint", () => {
  it("uses set tiers for normal and holo", () => {
    expect(
      narutoIndicativeQuoteForPrint({
        setCode: "s1",
        number: "ni004",
        rarity: "commune",
      }),
    ).toMatchObject({ cents: 10, tier: "normal" });
    expect(
      narutoIndicativeQuoteForPrint({
        setCode: "s4",
        number: "ni145",
        rarity: "holo",
      }),
    ).toMatchObject({ cents: 1000, tier: "holo" });
  });

  it("prefers premium and prerelease printKeys over the set tier", () => {
    expect(
      narutoIndicativeQuoteForPrint({
        setCode: "s4",
        number: "ni203",
        rarity: "holo",
      }),
    ).toMatchObject({ cents: 2500, tier: "premium" });
    expect(
      narutoIndicativeQuoteForPrint({
        setCode: "s1",
        number: "ni0019-prerelease",
        rarity: "prerelease",
      }),
    ).toMatchObject({ cents: 1000, tier: "prerelease" });
    expect(
      narutoIndicativeQuoteForPrint({
        setCode: "s1",
        number: "ni0025-prerelease",
        rarity: "prerelease",
      }),
    ).toMatchObject({ cents: 1000, tier: "prerelease" });
    expect(
      narutoIndicativeQuoteForPrint({
        setCode: "s1",
        number: "ta0004-prerelease",
        rarity: "prerelease",
      }),
    ).toMatchObject({ cents: 1000, tier: "prerelease" });
    // Retail S1 of the same number keeps bulk / holo, not the alt cote.
    expect(
      narutoIndicativeQuoteForPrint({
        setCode: "s1",
        number: "ni019",
        rarity: "holo",
      }),
    ).toMatchObject({ cents: 500, tier: "holo" });
    expect(
      narutoIndicativeQuoteForPrint({
        setCode: "s5",
        number: "ni221",
        rarity: "holo",
      }),
    ).toMatchObject({ cents: 5000, tier: "premium" });
    expect(
      narutoIndicativeQuoteForPrint({
        setCode: "s6",
        number: "ni236",
        rarity: null,
      }),
    ).toMatchObject({ cents: 1000, tier: "premium" });
  });

  it("does not invent quotes outside S1–S5 FR Carddass", () => {
    expect(
      narutoIndicativeQuoteForPrint({
        setCode: "s28",
        number: "n1621",
        rarity: "rare",
      }),
    ).toBeNull();
    expect(
      narutoIndicativeQuoteForPrint({
        setCode: "s1",
        number: "n0001",
        rarity: "common",
      }),
    ).toBeNull();
  });

  it("prices promo shuriken tiers and tin / CdF specials", () => {
    expect(
      narutoIndicativeQuoteForPrint({
        setCode: "promo",
        number: "te002",
      }),
    ).toMatchObject({ cents: 2000, tier: "premium" });
    expect(
      narutoIndicativeQuoteForPrint({
        setCode: "promo",
        number: "ni063",
      }),
    ).toMatchObject({ cents: 3000, tier: "premium" });
    expect(
      narutoIndicativeQuoteForPrint({
        setCode: "promo",
        number: "ta011",
      }),
    ).toMatchObject({ cents: 5000, tier: "premium" });
    expect(
      narutoIndicativeQuoteForPrint({
        setCode: "promo",
        number: "ni023",
      }),
    ).toMatchObject({ cents: 10000, tier: "premium" });
    expect(
      narutoIndicativeQuoteForPrint({
        setCode: "promo",
        number: "ni0023-promo",
      }),
    ).toMatchObject({ cents: 10000, tier: "premium" });
    expect(
      narutoIndicativeQuoteForPrint({
        setCode: "promo",
        number: "pr016",
      }),
    ).toMatchObject({ cents: 500, tier: "premium" });
    expect(
      narutoIndicativeQuoteForPrint({
        setCode: "promo",
        number: "pr011",
      }),
    ).toMatchObject({ cents: 800, tier: "premium" });
  });
});
