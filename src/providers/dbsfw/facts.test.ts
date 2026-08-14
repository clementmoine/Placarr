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
