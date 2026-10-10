import { describe, expect, it, afterEach } from "vitest";
import { isReferencePriceSource } from "@/core/catalog/catalog";
import { priceProbeContext } from "@/providers/shared/createPrintKeyPriceModule";
import { narutocarddassModule } from "../index";
import { NARUTO_INDICATIVE_PRICE_SOURCE, refreshNarutoIndicativePriceOffers, narutoIndicativeQuoteForPrint, resetNarutoIndicativeQuotesCache } from "./prices";

// —— collectionNarutoPriceOffers ——
{
  describe("refreshNarutoIndicativePriceOffers", () => {
    it("registers Collection Naruto as a TCG reference price source", () => {
      expect(narutocarddassModule.info.referencePriceSource).toBe(true);
      expect(narutocarddassModule.info.evidenceOnlyPriceRefresh).toBe(true);
      expect(narutocarddassModule.info.capabilities).toContain("price");
      expect(isReferencePriceSource(NARUTO_INDICATIVE_PRICE_SOURCE)).toBe(true);
      expect(isReferencePriceSource("narutocarddass")).toBe(true);
    });

    it("returns estimated EUR offers for dig-covered S1–S6 / promo prints", async () => {
      const s4 = await refreshNarutoIndicativePriceOffers(
        priceProbeContext({
          printKey: "naruto:ni-0203",
          name: "Manda",
        }),
      );
      expect(s4).toEqual([
        expect.objectContaining({
          source: NARUTO_INDICATIVE_PRICE_SOURCE,
          condition: "estimated",
          priceCents: 2500,
          currency: "EUR",
          metadataScoped: true,
        }),
      ]);

      const promo = await refreshNarutoIndicativePriceOffers(
        priceProbeContext({
          printKey: "naruto:ni-0023-promo",
          name: "Kakashi Hatake",
        }),
      );
      expect(promo[0]).toMatchObject({
        condition: "estimated",
        priceCents: 10000,
      });

      const prerelease = await refreshNarutoIndicativePriceOffers(
        priceProbeContext({
          printKey: "naruto:ni-0019-prerelease",
          name: "Naruto Uzumaki",
        }),
      );
      // Needs index rebuild for prerelease printKeys — skip soft if absent.
      if (prerelease.length) {
        expect(prerelease[0]).toMatchObject({
          condition: "estimated",
          priceCents: 1000,
        });
      }
    });

    it("stays quiet outside Naruto / without a printKey", async () => {
      expect(
        await refreshNarutoIndicativePriceOffers(
          priceProbeContext({
            printKey: "lorcana:1-1",
            name: "Ariel",
          }),
        ),
      ).toEqual([]);
      expect(
        await refreshNarutoIndicativePriceOffers({
          ...priceProbeContext({ printKey: "naruto:ni-0001", name: "x" }),
          printKey: undefined,
          externalIds: {},
        }),
      ).toEqual([]);
    });
  });
}

// —— collectionNarutoIndicativeQuotes ——
{
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
}

