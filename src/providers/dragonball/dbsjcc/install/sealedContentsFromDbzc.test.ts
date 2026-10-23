import { describe, expect, it } from "vitest";

import { DBSJCC_DETECTEUR_PRINT_KEY } from "../printKey";
import { buildSealedContentsFromDbzcLedger } from "./sealedContentsFromDbzc";

describe("buildSealedContentsFromDbzcLedger", () => {
  it("attaches partial guaranteed lists to themed starters", () => {
    const { skus, report } = buildSealedContentsFromDbzcLedger();
    expect(report.decks).toBeGreaterThanOrEqual(14);
    const saiyans = skus["part1-starter-1190"] as {
      guaranteedPrints: { printKey: string }[];
      contentsKnown: boolean;
    };
    expect(saiyans.guaranteedPrints.length).toBeGreaterThanOrEqual(20);
    expect(saiyans.contentsKnown).toBe(false);
    expect(skus["part2-starter-ruban-rouge"]).toBeTruthy();
    expect(skus["part3-starter-championnat"]).toBeTruthy();
  });

  it("adds the shared Détecteur print to Série 4–10 starters only", () => {
    const { skus } = buildSealedContentsFromDbzcLedger();
    const hasDetecteur = (slug: string) =>
      (
        (skus[slug] as { guaranteedPrints: { printKey: string }[] })
          ?.guaranteedPrints ?? []
      ).some((row) => row.printKey === DBSJCC_DETECTEUR_PRINT_KEY);

    expect(hasDetecteur("part1-starter-1190")).toBe(false);
    expect(hasDetecteur("part3-starter-1197")).toBe(false);
    expect(hasDetecteur("part4-starter-1200")).toBe(true);
    expect(hasDetecteur("part4-starter-forces-du-mal")).toBe(true);
    expect(hasDetecteur("part7-starter-1208")).toBe(true);
    expect(hasDetecteur("part10-starter-1219")).toBe(true);
  });
});
