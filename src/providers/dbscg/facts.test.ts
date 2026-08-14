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
