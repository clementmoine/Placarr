import { describe, expect, it } from "vitest";

import {
  carddasJpPromoCards,
  mergeCarddasJpPromoIntoIndex,
} from "./parseCarddasJpExtras";
import { mintNarutoPrintKey, parseNarutoCollector } from "./collectorIdentity";

describe("official JP promo identity", () => {
  it("keeps PR忍 off 忍 and 忍-1（PS） off the booster", () => {
    expect(parseNarutoCollector("PR-忍-1")).toMatchObject({
      family: "promo",
      number: 1,
      printedPrefix: "prni",
    });
    expect(mintNarutoPrintKey("PR-忍-1")).toBe("naruto:prni-0001");
    expect(mintNarutoPrintKey("忍-1")).toBe("naruto:ni-0001");
    expect(parseNarutoCollector("忍-1（PS）")).toMatchObject({
      family: "ninja",
      number: 1,
      grouping: "ps",
    });
    expect(mintNarutoPrintKey("忍-1（PS）")).toBe("naruto:ni-0001-ps");
  });

  it("does not fold 幕 ju-001 onto CCG J-001", () => {
    expect(mintNarutoPrintKey("mju0001")).toBe("naruto:mju-0001");
    expect(mintNarutoPrintKey("J-001")).toBe("naruto:j-0001");
    expect(mintNarutoPrintKey("shi0001")).toBe("naruto:shi-0001");
    expect(mintNarutoPrintKey("ni0001")).toBe("naruto:ni-0001");
  });
});

describe("carddasJpPromoCards", () => {
  it("ships official promo titles, not Data Carddass", () => {
    const cards = carddasJpPromoCards();
    expect(cards.length).toBe(61);
    expect(cards.find((row) => row.printed === "PR-忍-6")?.name).toBe(
      "二代目火影",
    );
    expect(cards.some((row) => row.number.startsWith("nm"))).toBe(false);
  });
});


describe("mergeCarddasJpPromoIntoIndex", () => {
  it("mints PR忍 beside NI and does not overwrite 巻ノ JA", () => {
    const merged = mergeCarddasJpPromoIntoIndex({
      prints: [
        {
          printKey: "naruto:ni-0001",
          setCode: "maki1",
          number: "ni0001",
          cardType: "ni",
          family: "ninja",
        },
      ],
      titles: [
        { printKey: "naruto:ni-0001", lang: "ja", fullName: "うずまきナルト" },
      ],
    });
    expect(merged.addedPrints).toContain("naruto:prni-0001");
    expect(
      merged.titles.find((t) => t.printKey === "naruto:ni-0001")?.fullName,
    ).toBe("うずまきナルト");
  });
});

