import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  bandaiFrSerie1DetailleeHoloCount,
  bandaiFrSerie1DetailleeLedger,
  bandaiFrSerie1DetailleePrintKeys,
} from "./bandaiFrSerie1Detaillee";

describe("bandaiFrSerie1Detaillee", () => {
  it("matches the printed Carddass FR S1 checklist (184) and marketing holos (33)", () => {
    const ledger = bandaiFrSerie1DetailleeLedger();
    expect(ledger.marketing.collectorTotal).toBe(188);
    expect(ledger.marketing.holos).toBe(33);
    expect(ledger.cardCount).toBe(188);
    expect(bandaiFrSerie1DetailleeHoloCount()).toBe(33);

    const keys = bandaiFrSerie1DetailleePrintKeys();
    expect(keys).toHaveLength(184);

    const checklistPath = path.join(
      process.cwd(),
      "src/providers/narutocarddass/curated/sources/carddass-fr-checklist.json",
    );
    const checklist = JSON.parse(readFileSync(checklistPath, "utf8")) as {
      sets: { s1: { ids: string[] } };
    };
    expect([...checklist.sets.s1.ids].sort()).toEqual(keys);
  });
});
