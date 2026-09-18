import { describe, expect, it } from "vitest";

import { dbsCgIndexNumbers, joinDbsCgFacts } from "./buildMastersFacts";
import type { DbsCgCardFacts } from "./mastersFacts";

function card(cardNumber: string, name = "Carte"): DbsCgCardFacts {
  return {
    cardNumber,
    sourceNumber: cardNumber,
    name,
    rarity: "Common",
    rarityCode: "C",
    cardType: "BATTLE",
    color: "Red",
    series: null,
    character: [],
    era: [],
    traits: [],
    keywords: [],
    power: "10000",
    energyCost: "2",
    comboCost: null,
    comboPower: null,
    zEnergyCost: null,
    skill: "[Auto] …",
    back: null,

    banned: false,
    limitedTo: null,
    erratas: [],
    draft: false,
  };
}

describe("dbsCgIndexNumbers", () => {
  it("normalise les numéros du pack", () => {
    const numbers = dbsCgIndexNumbers({
      version: 1,
      pack: "dbs/cg",
      generatedAt: "",
      cards: {
        "dbscg:bt1-001": { set: "bt1", card: "001" },
        "dbscg:ex06-35": { set: "ex06", card: "35" },
        "dbscg:sans-set": { card: "010" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    });
    expect(numbers).toEqual(["BT1-001", "EX06-035"]);
  });
});

describe("joinDbsCgFacts", () => {
  it("attache les faits au tirage qui porte le numéro", () => {
    const { cards, coverage } = joinDbsCgFacts([card("BT1-001")], ["BT1-001"]);
    expect(cards["BT1-001"]?.name).toBe("Carte");
    expect(cards["BT1-001"]?.inheritedFrom).toBeUndefined();
    expect(coverage).toMatchObject({ exact: 1, inherited: 0, missing: 0 });
  });

  it("fait descendre les faits du numéro de base sur une réimpression, en le disant", () => {
    const { cards, coverage } = joinDbsCgFacts(
      [card("BT1-005", "Vegeta")],
      ["BT1-005-BD"],
    );
    expect(cards["BT1-005-BD"]).toMatchObject({
      name: "Vegeta",
      inheritedFrom: "BT1-005",
    });
    expect(coverage).toMatchObject({ exact: 0, inherited: 1 });
  });

  it("compte et nomme les tirages qu'aucune ligne ne couvre", () => {
    const { cards, coverage } = joinDbsCgFacts(
      [card("BT1-001")],
      ["BT1-001", "BT30-016"],
    );
    expect(cards["BT30-016"]).toBeUndefined();
    expect(coverage.missing).toBe(1);
    expect(coverage.missingSample).toEqual(["BT30-016"]);
  });

  it("garde les lignes du dépôt que le catalogue n'a pas encore", () => {
    // Le dépôt connaît des tirages absents du pack : les jeter serait perdre
    // ce qu'on est allé chercher.
    const { cards } = joinDbsCgFacts(
      [card("BT1-001"), card("PR-999")],
      ["BT1-001"],
    );
    expect(cards["PR-999"]?.name).toBe("Carte");
  });
});
