import { describe, expect, it } from "vitest";

import {
  sealedPrintLooksLikeFixeezChase,
  splitSealedLotteryChasePrints,
} from "./lotteryChaseSplit";

describe("lotteryChaseSplit", () => {
  it("detects Leclerc Fixeez printKeys and titles", () => {
    expect(
      sealedPrintLooksLikeFixeezChase({
        printKey: "leclerc:disney25-f01",
        name: "Fixeez — Mickey",
        slug: "leclerc:disney25-f01",
        ref: null,
      }),
    ).toBe(true);
    expect(
      sealedPrintLooksLikeFixeezChase({
        printKey: "leclerc:disney25-001",
        name: "Lilo",
        slug: "leclerc:disney25-001",
        ref: null,
      }),
    ).toBe(false);
  });

  it("keeps chase out of the base lottery section (not guaranteed)", () => {
    const { base, chase } = splitSealedLotteryChasePrints([
      {
        printKey: "leclerc:disney25-001",
        name: "Lilo",
        slug: "leclerc:disney25-001",
        ref: null,
      },
      {
        printKey: "leclerc:disney25-f06",
        name: "Fixeez — Main de Mickey",
        slug: "leclerc:disney25-f06",
        ref: null,
      },
    ]);
    expect(base.map((p) => p.printKey)).toEqual(["leclerc:disney25-001"]);
    expect(chase.map((p) => p.printKey)).toEqual(["leclerc:disney25-f06"]);
  });
});
