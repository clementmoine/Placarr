import { describe, expect, it } from "vitest";

import { dbsFwPrintFacts } from "./facts";
import type { DbsFwPrintDetail } from "./searchPrints";

function row(overrides: Partial<DbsFwPrintDetail> = {}): DbsFwPrintDetail {
  return {
    printKey: "dbsfw:st01-001",
    setCode: "st01",
    number: "001",
    grouping: null,
    lang: "en",
    fullName: "Son Goten",
    setName: "STORY BOOSTER 01 [ST01]",
    imageUrl: null,
    ...overrides,
  };
}

describe("dbsFwPrintFacts", () => {
  it("emits collector number and set, not Thèmes", () => {
    const facts = dbsFwPrintFacts(row(), "dbsfw");
    expect(facts.find((fact) => fact.label === "Numéro")?.value).toBe(
      "ST01-001",
    );
    expect(facts.find((fact) => fact.label === "Extension")?.value).toContain(
      "ST01",
    );
    expect(facts.every((fact) => fact.kind !== "tag")).toBe(true);
  });
});

describe("dbsFwPrintFacts — ce que la fiche détaillée ajoute", () => {
  const base = {
    printKey: "dbsfw:st01-001",
    setCode: "ST01",
    number: "001",
    grouping: null,
    lang: "en",
    fullName: "Son Goten",
    setName: "STORY BOOSTER 01",
    imageUrl: null,
  };

  it("porte rareté, type, couleur, coût, puissance, traits et texte", () => {
    const facts = dbsFwPrintFacts(
      {
        ...base,
        harvested: {
          cardNumber: "ST01-001",
          rarity: "L",
          name: "Son Goten",
          cardType: "LEADER",
          color: "Red",
          cost: "1",
          specifiedCost: "R",
          power: ["15000", "20000"],
          comboPower: "10000",
          specialTraits: ["Saiyan/Earthling"],
          skills: ["[Auto] Play up to 1 card.", "[When Attacking] Draw 1."],
        },
      },
      "dbsfw",
    );
    const byLabel = Object.fromEntries(facts.map((f) => [f.label, f.value]));
    expect(byLabel["Rareté"]).toBe("L");
    expect(byLabel["Type"]).toBe("LEADER");
    expect(byLabel["Couleur"]).toBe("Red");
    expect(byLabel["Coût"]).toBe("1");
    // Un Leader a deux faces : les deux puissances, pas la première seule.
    expect(byLabel["Puissance"]).toBe("15000 / 20000");
    expect(byLabel["Traits"]).toBe("Saiyan/Earthling");
    expect(byLabel["Texte"]).toContain("[When Attacking] Draw 1.");
  });

  it("s'en tient au numéro quand la carte n'a pas de fiche détaillée", () => {
    const facts = dbsFwPrintFacts({ ...base, harvested: null }, "dbsfw");
    expect(facts.map((f) => f.label)).toEqual([
      "Numéro",
      "Extension",
      "Langue",
    ]);
  });
});
