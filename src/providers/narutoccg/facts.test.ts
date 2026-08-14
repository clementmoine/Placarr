import { describe, expect, it } from "vitest";

import { narutoPrintFacts, narutoSetLabel } from "./facts";
import type { NarutoPrintDetail } from "./searchPrints";

const row = (over: Partial<NarutoPrintDetail> = {}): NarutoPrintDetail => ({
  printKey: "naruto:s5-ni232",
  setCode: "s5",
  number: "ni232",
  cardType: "ni",
  lang: "fr",
  fullName: "Shikamaru Nara",
  rarity: "commune",
  art: "art.webp",
  thumb: null,
  ...over,
});

const value = (facts: ReturnType<typeof narutoPrintFacts>, label: string) =>
  facts.find((f) => f.label === label)?.value;

describe("narutoSetLabel", () => {
  it("names a series by its two starters, which is what a collector recognises", () => {
    expect(narutoSetLabel("s5")).toBe("Série 5 — La quête / Un nouveau départ");
  });

  it("marks the cancelled series rather than presenting it as shipped", () => {
    expect(narutoSetLabel("s6")).toContain("(annulée)");
  });

  it("keeps promos out of the series numbering", () => {
    expect(narutoSetLabel("promo")).toBe("Promo (hors série)");
  });
});

describe("narutoPrintFacts", () => {
  it("leads with the printed number, without the set prefix", () => {
    expect(value(narutoPrintFacts(row(), "narutoccg"), "Numéro")).toBe(
      "NI-232",
    );
  });

  it("spells the card family the way the site filed it", () => {
    expect(value(narutoPrintFacts(row(), "narutoccg"), "Type")).toBe("Ninja");
    expect(
      value(narutoPrintFacts(row({ cardType: "ta" }), "narutoccg"), "Type"),
    ).toBe("Tactique");
  });

  it("omits Type for the promo line, which would only repeat the rarity", () => {
    const facts = narutoPrintFacts(
      row({ setCode: "promo", number: "pr016", cardType: "pr" }),
      "narutoccg",
    );
    expect(value(facts, "Type")).toBeUndefined();
  });

  it("adds how a promo was handed out, and its shuriken count", () => {
    const facts = narutoPrintFacts(
      row({ setCode: "promo", number: "te030", cardType: "te" }),
      "narutoccg",
    );
    expect(value(facts, "Distribution")).toContain("Coupe de France");
    expect(value(facts, "Shurikens")).toBe("★★★");
  });

  it("skips a fact it has no value for rather than emitting a blank row", () => {
    const facts = narutoPrintFacts(row({ rarity: null }), "narutoccg");
    expect(value(facts, "Rareté")).toBeUndefined();
  });
});
