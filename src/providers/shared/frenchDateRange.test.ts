import { describe, expect, it } from "vitest";

import { parseFrenchDayMonthRange } from "./frenchDateRange";

describe("parseFrenchDayMonthRange", () => {
  it("lit une période avec l'année en fin", () => {
    expect(
      parseFrenchDayMonthRange("Opération du 3 novembre au 20 décembre 2020"),
    ).toEqual({ start: "2020-11-03", end: "2020-12-20" });
  });

  it("prend l'année de l'article quand le texte n'en donne pas", () => {
    expect(
      parseFrenchDayMonthRange("offerte du 24 octobre au 9 décembre.", 2017),
    ).toEqual({ start: "2017-10-24", end: "2017-12-09" });
    expect(
      parseFrenchDayMonthRange("du 15 décembre au 1er février", 2020),
    ).toEqual({ start: "2020-12-15", end: "2021-02-01" });
  });

  it("rend null sans période ni année", () => {
    expect(parseFrenchDayMonthRange("du 24 octobre au 9 décembre")).toBeNull();
    expect(parseFrenchDayMonthRange("aucune date ici", 2017)).toBeNull();
  });
});
