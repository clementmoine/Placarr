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
    expect(narutoSetLabel("s1", "n001")).toBe("Series 1 — The Path to Hokage");
    expect(narutoSetLabel("s1", "j001")).toBe("Series 1 — The Path to Hokage");
  });

  it("names Série 6 with the French Rivalité éternelle title", () => {
    expect(narutoSetLabel("s6")).toBe("Série 6 — Rivalité éternelle");
    expect(narutoSetLabel("s6", "ni0236")).toBe("Série 6 — Rivalité éternelle");
    expect(narutoSetLabel("s6", "n0236")).toBe("Series 6 — Eternal Rivalry");
  });

  it("keeps promos out of the series numbering", () => {
    expect(narutoSetLabel("promo")).toBe("Promo (hors série)");
    expect(narutoSetLabel("promo", null, "en")).toBe("Promo (off-series)");
    expect(narutoSetLabel("promo", null, "it")).toBe("Promo (fuori serie)");
  });

  it("names late FR CCG sets with their series number", () => {
    expect(narutoSetLabel("s24")).toBe("Série 24 — Sage's Legacy");
    expect(narutoSetLabel("s28")).toBe("Série 28 — Ultimate Ninja Storm 3");
    expect(narutoSetLabel("tempete")).toBe("Série 11 — La Tempête Approche");
  });

  it("uses Series N — Bandai USA titles when the checklist language is en", () => {
    expect(narutoSetLabel("s1", null, "en")).toBe(
      "Series 1 — The Path to Hokage",
    );
    expect(narutoSetLabel("s2", null, "en")).toBe(
      "Series 2 — Coils of the Snake",
    );
    expect(narutoSetLabel("s3", null, "en")).toBe(
      "Series 3 — Curse of the Sand",
    );
    expect(narutoSetLabel("s4", null, "en")).toBe(
      "Series 4 — Revenge and Rebirth",
    );
    expect(narutoSetLabel("s5", null, "en")).toBe("Series 5 — Dream Legacy");
    expect(narutoSetLabel("s6", null, "en")).toBe("Series 6 — Eternal Rivalry");
    expect(narutoSetLabel("s24", null, "en")).toBe("Series 24 — Sage's Legacy");
    expect(narutoSetLabel("s28", null, "en")).toBe(
      "Series 28 — Ultimate Ninja Storm 3",
    );
    expect(narutoSetLabel("s7", null, "en")).toBe("Series 7 — Quest for Power");
  });

  it("uses Serie N — Italian retail titles when the checklist language is it", () => {
    expect(narutoSetLabel("s1", null, "it")).toBe(
      "Serie 1 — La Forza della Foglia",
    );
    expect(narutoSetLabel("s2", null, "it")).toBe(
      "Serie 2 — Le Spire del Serpente",
    );
    expect(narutoSetLabel("s3", null, "it")).toBe(
      "Serie 3 — La Maledizione della Sabbia",
    );
    expect(narutoSetLabel("s4", null, "it")).toBe(
      "Serie 4 — Vendetta e Redenzione",
    );
    expect(narutoSetLabel("s5", null, "it")).toBe(
      "Serie 5 — L'Eredità del Sogno",
    );
    expect(narutoSetLabel("s6", null, "it")).toBe("Serie 6 — Rivalità Eterna");
    expect(narutoSetLabel("s7", null, "it")).toBe("Serie 7 — Sete di Potere");
    expect(narutoSetLabel("s8", null, "it")).toBe(
      "Serie 8 — Il Vento del Cambiamento",
    );
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

  it("labels 1★ tournament promos as participation (TE-002 Shuriken)", () => {
    const facts = narutoPrintFacts(
      row({ setCode: "promo", number: "te002", cardType: "te" }),
      "narutocarddass",
    );
    expect(value(facts, "Distribution")).toBe("Tournoi — participation");
    expect(value(facts, "Shurikens")).toBe("★");
  });

  it("labels 2★ as top 5 and 3★ as vainqueur", () => {
    expect(
      value(
        narutoPrintFacts(
          row({ setCode: "promo", number: "ni063", cardType: "ni" }),
          "narutocarddass",
        ),
        "Distribution",
      ),
    ).toBe("Tournoi — top 5");
    expect(
      value(
        narutoPrintFacts(
          row({ setCode: "promo", number: "ta011", cardType: "ta" }),
          "narutocarddass",
        ),
        "Distribution",
      ),
    ).toBe("Tournoi — vainqueur");
  });

  it("labels S1 manga prerelease prints and estimates ~10 €", () => {
    const facts = narutoPrintFacts(
      row({
        setCode: "s1",
        number: "ni0019-prerelease",
        cardType: "ni",
        rarity: "prerelease",
      }),
      "narutocarddass",
    );
    expect(value(facts, "Numéro")).toBe("NI-019 · prerelease");
    expect(value(facts, "Distribution")).toBe("Avant-première manga");
    expect(value(facts, "Estimation")).toBe("10 €");
  });

  it("estimates promo cotes from Collection Naruto (1★ / CdF / tin)", () => {
    expect(
      value(
        narutoPrintFacts(
          row({ setCode: "promo", number: "te002", cardType: "te" }),
          "narutocarddass",
        ),
        "Estimation",
      ),
    ).toBe("20 €");
    expect(
      value(
        narutoPrintFacts(
          row({ setCode: "promo", number: "ni023", cardType: "ni" }),
          "narutocarddass",
        ),
        "Estimation",
      ),
    ).toBe("100 €");
    expect(
      value(
        narutoPrintFacts(
          row({ setCode: "promo", number: "pr016", cardType: "pr" }),
          "narutocarddass",
        ),
        "Estimation",
      ),
    ).toBe("5 €");
  });

  it("skips a fact it has no value for rather than emitting a blank row", () => {
    const facts = narutoPrintFacts(row({ rarity: null }), "narutocarddass");
    expect(value(facts, "Rareté")).toBeUndefined();
  });

  it("emits an approximate Collection Naruto quote as Estimation", () => {
    const facts = narutoPrintFacts(
      row({
        setCode: "s4",
        number: "ni203",
        rarity: "holo",
      }),
      "narutocarddass",
    );
    expect(value(facts, "Estimation")).toBe("25 €");
    expect(facts.find((f) => f.label === "Estimation")?.kind).toBe("price");
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
    ).toBe("Series 1 — The Path to Hokage");
  });
});
