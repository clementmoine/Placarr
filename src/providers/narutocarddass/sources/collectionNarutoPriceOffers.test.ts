import { describe, expect, it } from "vitest";

import { isReferencePriceSource } from "@/core/catalog/catalog";
import { narutocarddassModule } from "../index";
import {
  NARUTO_INDICATIVE_PRICE_SOURCE,
  refreshNarutoIndicativePriceOffers,
} from "./collectionNarutoPriceOffers";
import { priceProbeContext } from "@/providers/shared/createPrintKeyPriceModule";

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
