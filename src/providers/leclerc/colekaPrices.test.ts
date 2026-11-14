import { describe, expect, it } from "vitest";
import {
  colekaLeclercDealsTargets,
  colekaLeclercRefToNumber,
} from "./colekaPrices";

describe("colekaLeclercRefToNumber", () => {
  it("pads checklist refs and Fixeez F-numbers", () => {
    expect(colekaLeclercRefToNumber("9")).toBe("009");
    expect(colekaLeclercRefToNumber("009")).toBe("009");
    expect(colekaLeclercRefToNumber("F14")).toBe("f14");
    expect(colekaLeclercRefToNumber("f 3")).toBe("f03");
    expect(colekaLeclercRefToNumber(null)).toBeNull();
    expect(colekaLeclercRefToNumber("album")).toBeNull();
  });
});

describe("colekaLeclercDealsTargets", () => {
  it("covers Cosmic / Maîtriser / Deviens + supermarché Coleka rubriques", () => {
    const targets = colekaLeclercDealsTargets();
    expect(targets.map((t) => t.rubriqueId)).toEqual([
      "35",
      "343",
      "4483",
      "11922",
      "15811",
      "22334",
      "28635",
      "35559",
      "41370",
      "46879",
    ]);
    expect(targets[0]!.resolvePrintKey({ refItem: "009" } as never)).toBe(
      "leclerc:sw15-009",
    );
    expect(targets[5]!.resolvePrintKey({ refItem: "009" } as never)).toBe(
      "leclerc:marvel21-009",
    );
  });
});
