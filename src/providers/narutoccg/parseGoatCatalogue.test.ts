import { describe, expect, it } from "vitest";

import {
  goatLastPage,
  parseGoatCataloguePage,
  parseGoatProductName,
} from "./parseGoatCatalogue";

describe("parseGoatProductName", () => {
  it("splits name / ref / rarity / edition / finish", () => {
    expect(
      parseGoatProductName(
        "8 Trigram Divination Seal Spell Fomula - J-006 - Common - 1st Edition - Wavy Foil",
      ),
    ).toMatchObject({
      printedRef: "J-006",
      name: "8 Trigram Divination Seal Spell Fomula",
      rarity: "Common",
      edition: "1st Edition",
      finish: "Wavy Foil",
      extra: [],
    });
  });

  it("classifies by vocabulary, not by position", () => {
    // Finish before edition, and the shop's own order is not guaranteed.
    const row = parseGoatProductName("Kakashi - N-100 - Rare - Diamond Foil");
    expect(row?.rarity).toBe("Rare");
    expect(row?.finish).toBe("Diamond Foil");
    expect(row?.edition).toBeNull();
  });

  it("keeps a segment it cannot place instead of guessing", () => {
    // A real printing quirk on this shop — not noise to drop.
    const row = parseGoatProductName(
      "8 Trigram - J-006 - Common - 1st Edition on top left",
    );
    expect(row?.rarity).toBe("Common");
    expect(row?.edition).toBeNull();
    expect(row?.extra).toEqual(["1st Edition on top left"]);
  });

  it("keeps a hyphen that belongs to the card name", () => {
    const row = parseGoatProductName(
      "Naruto Uzumaki - Nine Tails - N-1646 - Super Rare - 1st Edition",
    );
    expect(row?.name).toBe("Naruto Uzumaki - Nine Tails");
    expect(row?.printedRef).toBe("N-1646");
    expect(row?.rarity).toBe("Super Rare");
  });

  it("reads the US tin refs the shop writes", () => {
    expect(
      parseGoatProductName("Prompt Instruction - M-US043 - Rare"),
    ).toMatchObject({ printedRef: "M-US043", rarity: "Rare" });
  });

  it("refuses a title with no ref rather than inventing one", () => {
    expect(parseGoatProductName("Naruto CCG Booster Pack")).toBeNull();
    expect(parseGoatProductName("J-006")).toBeNull();
  });
});

describe("parseGoatCataloguePage", () => {
  const HTML = `
    <form class="add-to-cart-form" data-name="A Kind Teacher - M-004 - Starter Deck"></form>
    <form class="add-to-cart-form" data-name="A Kind Teacher - M-004 - Starter Deck"></form>
    <form class="add-to-cart-form" data-name="Rock Lee &amp; Guy - N-041 - Rare - Unlimited Edition"></form>
    <form class="add-to-cart-form" data-name="Sleeves 100ct"></form>
  `;

  it("dedupes identical products and drops what has no ref", () => {
    const rows = parseGoatCataloguePage(HTML);
    expect(rows.map((r) => r.printedRef)).toEqual(["M-004", "N-041"]);
    expect(rows[1]?.name).toBe("Rock Lee & Guy");
  });
});

describe("goatLastPage", () => {
  it("takes the highest page the pager exposes", () => {
    const html = `<a href="/catalog/x/3877?page=2">2</a><a href="/catalog/x/3877?page=5">5</a>`;
    expect(goatLastPage(html, 3877)).toBe(5);
    expect(goatLastPage("<a>no pager</a>", 3877)).toBe(1);
  });
});
