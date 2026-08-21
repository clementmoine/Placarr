import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadStorm3Ledger, storm3LedgerPath } from "./scrapeStorm3";

describe("loadStorm3Ledger", () => {
  it("reads staging/stop2shop-uns3 under the pack root (not nested twice)", () => {
    const packDir = mkdtempSync(path.join(tmpdir(), "naruto-storm3-"));
    const dest = storm3LedgerPath(packDir);
    expect(dest).toBe(
      path.join(packDir, "staging", "stop2shop-uns3", "cards.json"),
    );
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(
      dest,
      JSON.stringify({
        cards: [
          {
            number: "n1685",
            cardType: "n",
            name: "MADARA UCHIHA",
            rarity: "super rare",
            productPath: "/n1685.html",
          },
        ],
      }),
      "utf8",
    );
    expect(loadStorm3Ledger(packDir).map((c) => c.number)).toEqual(["n1685"]);
  });
});
