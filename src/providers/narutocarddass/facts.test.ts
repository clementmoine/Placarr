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
    expect(narutoSetLabel("s1")).toBe("Série 1 — Maître Hokage / Pays du Vent");
    expect(narutoSetLabel("s1", "ni001")).toBe(
      "Série 1 — Maître Hokage / Pays du Vent",
    );
  });

  it("names EN CCG Series 1 Path to Hokage without colliding with Carddass s1", () => {
    expect(narutoSetLabel("s1", "n001")).toBe("The Path to Hokage");
    expect(narutoSetLabel("s1", "j001")).toBe("The Path to Hokage");
  });

  it("names the Italian physical series, not a shipped French set", () => {
    expect(narutoSetLabel("s6")).toBe("Série 6 — Rivalità Eterna");
  });

  it("keeps promos out of the series numbering", () => {
    expect(narutoSetLabel("promo")).toBe("Promo (hors série)");
  });

  it("uses the official EN CCG title for Ultimate Ninja Storm 3", () => {
    expect(narutoSetLabel("s28")).toBe("Ultimate Ninja Storm 3");
  });

  it("uses the official EN CCG title for Fateful Reunion and Avenger's Wrath", () => {
    expect(narutoSetLabel("s13")).toBe("Fateful Reunion");
    expect(narutoSetLabel("s26")).toBe("Avenger's Wrath");
    expect(narutoSetLabel("s27")).toBe("Hero's Ascension");
  });

  it("uses Goat / official EN titles for Coleka-missing series", () => {
    expect(narutoSetLabel("s7")).toBe("Quest for Power");
    expect(narutoSetLabel("s16")).toBe("Broken Promises");
    expect(narutoSetLabel("s19")).toBe("Path of Pain");
    expect(narutoSetLabel("s21")).toBe("Shattered Truth");
    expect(narutoSetLabel("s22")).toBe("Weapons of War");
    expect(narutoSetLabel("s23")).toBe("Invasion");
  });

  it("names Bandai USA tins and tournament packs", () => {
    expect(narutoSetLabel("tin1")).toBe("Rebirth Tin");
    expect(narutoSetLabel("tp3")).toBe("Tournament Pack 3");
  });

  it("keeps 巻ノ五 and 第五幕 as distinct JP labels", () => {
    expect(narutoSetLabel("maki1")).toBe("巻ノ壱");
    expect(narutoSetLabel("maki5")).toBe("巻ノ五 — 実力伯仲！予選死闘編");
    expect(narutoSetLabel("maki17")).toBe("巻ノ十七");
    expect(narutoSetLabel("maku1")).toBe("第一幕");
    expect(narutoSetLabel("gaku")).toBe("忍者学校");
    expect(narutoSetLabel("maku5")).toBe("第五幕 — 再会、忌まわしき写輪眼！編");
  });
});

describe("narutoPrintFacts", () => {
  it("leads with the printed number, without the set prefix", () => {
    expect(value(narutoPrintFacts(row(), "narutocarddass"), "Numéro")).toBe(
      "NI-232",
    );
  });

  it("spells the card family the way the site filed it", () => {
    expect(value(narutoPrintFacts(row(), "narutocarddass"), "Type")).toBe("Ninja");
    expect(
      value(narutoPrintFacts(row({ cardType: "ta" }), "narutocarddass"), "Type"),
    ).toBe("Tactique");
  });

  it("omits Type for the promo line, which would only repeat the rarity", () => {
    const facts = narutoPrintFacts(
      row({ setCode: "promo", number: "pr016", cardType: "pr" }),
      "narutocarddass",
    );
    expect(value(facts, "Type")).toBeUndefined();
  });

  it("adds how a promo was handed out, and its shuriken count", () => {
    const facts = narutoPrintFacts(
      row({ setCode: "promo", number: "te030", cardType: "te" }),
      "narutocarddass",
    );
    expect(value(facts, "Distribution")).toContain("Coupe de France");
    expect(value(facts, "Shurikens")).toBe("★★★");
  });

  it("skips a fact it has no value for rather than emitting a blank row", () => {
    const facts = narutoPrintFacts(row({ rarity: null }), "narutocarddass");
    expect(value(facts, "Rareté")).toBeUndefined();
  });

  it("labels an EN Path to Hokage print, not the Carddass starters", () => {
    expect(
      value(
        narutoPrintFacts(
          row({
            printKey: "naruto:n-0001",
            setCode: "s1",
            number: "n0001",
            cardType: "n",
            lang: "en",
            fullName: "Naruto Uzumaki",
          }),
          "narutocarddass",
        ),
        "Extension",
      ),
    ).toBe("The Path to Hokage");
  });
});
