import { describe, expect, it } from "vitest";

import {
  attestedPromoPrintKey,
  groupingFromDiskCardId,
  mergeAttestedPromos,
  type AttestedPromoRow,
} from "./attestedPromos";
import type { NarutoPrintRow, NarutoTitleRow } from "./indexStore";

describe("attestedPromos", () => {
  it("parses cdf grouping from diskCardId", () => {
    expect(groupingFromDiskCardId("te030", "te030-cdf")).toBe("cdf");
    expect(groupingFromDiskCardId("ni063", "ni063")).toBeNull();
    expect(groupingFromDiskCardId("ni063", undefined)).toBeNull();
  });

  it("builds promo printKeys", () => {
    expect(
      attestedPromoPrintKey({ number: "ni063", name: "Iruka" }),
    ).toBe("naruto:promo-ni063");
    expect(
      attestedPromoPrintKey({
        number: "te030",
        name: "L'éclair pourfendeur",
        diskCardId: "te030-cdf",
      }),
    ).toBe("naruto:promo-te030-cdf");
  });

  it("injects missing promo prints with FR names, keeps existing art rows", () => {
    const existing: NarutoPrintRow = {
      printKey: "naruto:promo-ni095",
      setCode: "promo",
      number: "ni095",
      cardType: "ni",
    };
    const titles: NarutoTitleRow[] = [
      {
        printKey: "naruto:promo-ni095",
        lang: "fr",
        fullName: "Neji Hyûga",
        rarity: "promo",
      },
    ];
    const promos: AttestedPromoRow[] = [
      { number: "ni095", name: "Neji Hyûga", diskCardId: "ni095" },
      { number: "ni063", name: "Iruka", shuriken: 2 },
      {
        number: "te030",
        name: "L'éclair pourfendeur",
        diskCardId: "te030-cdf",
      },
    ];
    const merged = mergeAttestedPromos({
      prints: [existing],
      titles,
      promos,
    });
    expect(merged.addedPrints).toEqual([
      "naruto:promo-ni063",
      "naruto:promo-te030-cdf",
    ]);
    expect(
      merged.titles.find((t) => t.printKey === "naruto:promo-ni063")?.fullName,
    ).toBe("Iruka");
    expect(
      merged.prints.find((p) => p.printKey === "naruto:promo-ni095"),
    ).toEqual(existing);
  });
});
