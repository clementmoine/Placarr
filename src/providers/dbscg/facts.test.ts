import { describe, expect, it } from "vitest";

import { dbsCgPrintFacts } from "./facts";
import type { DbsPrintDetail } from "./searchPrints";

function row(overrides: Partial<DbsPrintDetail> = {}): DbsPrintDetail {
  return {
    printKey: "dbscg:bt1-001",
    setCode: "bt1",
    number: "001",
    grouping: null,
    cardType: "LEADER",
    lang: "fr",
    fullName: "Champa",
    rarity: "Rare[R]",
    setName: "Série 1 Booster ～GALACTIC BATTLE～",
    color: "Rouge",
    character: "Champa",
    power: "10000",
    awakenedName: "Champa, Dieu de la destruction",
    imageUrl: null,
    backUrl: null,
    ...overrides,
  };
}

function value(facts: ReturnType<typeof dbsCgPrintFacts>, label: string) {
  return facts.find((fact) => fact.label === label)?.value;
}

describe("dbsCgPrintFacts", () => {
  it("emits collector fields under their own labels, not Thèmes", () => {
    const facts = dbsCgPrintFacts(row(), "dbscg");
    expect(value(facts, "Numéro")).toBe("BT1-001");
    expect(value(facts, "Type")).toBe("LEADER");
    expect(value(facts, "Rareté")).toBe("Rare[R]");
    expect(value(facts, "Nom éveillé")).toBe("Champa, Dieu de la destruction");
    expect(facts.every((fact) => fact.kind !== "tag")).toBe(true);
  });

  it("prints an SPR grouping on the number", () => {
    expect(
      value(
        dbsCgPrintFacts(
          row({
            printKey: "dbscg:bt1-011-spr",
            number: "011",
            grouping: "spr",
            awakenedName: null,
          }),
          "dbscg",
        ),
        "Numéro",
      ),
    ).toBe("BT1-011_SPR");
  });
});

describe("dbsCgPrintFacts — ce que le dépôt Masters ajoute", () => {
  const base = {
    printKey: "dbscg:bt1-005",
    setCode: "BT1",
    number: "005",
    grouping: null,
    cardType: "BATTLE",
    lang: "fr",
    fullName: "Champa, Destruction accrue",
    rarity: "Uncommon",
    setName: "Galactic Battle",
    color: "Red",
    character: "Champa",
    power: "16000",
    awakenedName: null,
    imageUrl: null,
    backUrl: null,
  };

  const harvested = {
    cardNumber: "BT1-005",
    sourceNumber: "BT1-005",
    name: "Furthering Destruction Champa",
    rarity: "Uncommon",
    rarityCode: "UC",
    cardType: "BATTLE",
    color: "Red",
    series: "Galactic Battle",
    character: ["Champa"],
    era: ["Universe Survival Saga"],
    traits: ["God"],
    keywords: ["Double Strike"],
    power: "16000",
    energyCost: "3",
    comboCost: "1",
    comboPower: "5000",
    zEnergyCost: null,
    skill: "[Auto] When you Combo with this card…",
    back: null,
    banned: true,
    limitedTo: null,
    erratas: ["Texte corrigé le 2020-01-01."],
    draft: false,
  };

  it("porte traits, ère, mots-clés, coûts, texte, bannissement et errata", () => {
    const byLabel = Object.fromEntries(
      dbsCgPrintFacts({ ...base, harvested }, "dbscg").map((f) => [
        f.label,
        f.value,
      ]),
    );
    expect(byLabel["Traits"]).toBe("God");
    expect(byLabel["Ère"]).toBe("Universe Survival Saga");
    expect(byLabel["Mots-clés"]).toBe("Double Strike");
    expect(byLabel["Coût en énergie"]).toBe("3");
    expect(byLabel["Puissance de combo"]).toBe("5000");
    expect(byLabel["Texte"]).toContain("When you Combo");
    expect(byLabel["Statut tournoi"]).toBe("Bannie");
    expect(byLabel["Errata"]).toContain("Texte corrigé");
  });

  it("dit « limitée à N » plutôt que « bannie » quand c'est le cas", () => {
    const byLabel = Object.fromEntries(
      dbsCgPrintFacts(
        { ...base, harvested: { ...harvested, banned: false, limitedTo: 1 } },
        "dbscg",
      ).map((f) => [f.label, f.value]),
    );
    expect(byLabel["Statut tournoi"]).toBe("Limitée à 1");
  });

  it("garde la rareté française du catalogue, pas celle du dépôt anglais", () => {
    // Le dépôt écrit `Uncommon` ; la fiche FR doit rester sur son propre mot.
    const facts = dbsCgPrintFacts(
      { ...base, rarity: "Peu commune", harvested },
      "dbscg",
    );
    const rarities = facts.filter((f) => f.label === "Rareté");
    expect(rarities).toHaveLength(1);
    expect(rarities[0]?.value).toBe("Peu commune");
  });

  it("ne montre rien de plus quand le dépôt ne connaît pas la carte", () => {
    const labels = dbsCgPrintFacts({ ...base, harvested: null }, "dbscg").map(
      (f) => f.label,
    );
    expect(labels).not.toContain("Texte");
    expect(labels).not.toContain("Statut tournoi");
  });
});
