import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { dbsJccCuratedDir } from "../../pack";

describe("poster-part9-heros", () => {
  it("encodes 29 unique cards totaling 32 with three X2*", () => {
    const file = path.join(
      dbsJccCuratedDir(),
      "sources",
      "poster-part9-heros.json",
    );
    const ledger = JSON.parse(readFileSync(file, "utf8")) as {
      cards: { qty: number; ref: string }[];
      x2: string[];
      declaredCardCount: number;
    };
    expect(ledger.cards).toHaveLength(29);
    expect(ledger.x2).toEqual(["D-401", "D-526", "D-603"]);
    const sum = ledger.cards.reduce((n, c) => n + c.qty, 0);
    expect(sum).toBe(ledger.declaredCardCount);
    expect(sum).toBe(32);
    for (const ref of ledger.x2) {
      expect(ledger.cards.find((c) => c.ref === ref)?.qty).toBe(2);
    }
  });
});
