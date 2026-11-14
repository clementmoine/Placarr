import { describe, expect, it } from "vitest";

import {
  mangaSanctuaryIngestPackshots,
  mangaSanctuaryPackshotLedger,
} from "./mangaSanctuary";

describe("mangaSanctuaryPackshots", () => {
  it("maps the three news-3101 starter press shots onto part1/part2 decks", () => {
    const ledger = mangaSanctuaryPackshotLedger();
    expect(ledger.page).toContain("news/3101");
    expect(ledger.facts.startersPerSeries).toBe(2);
    expect(ledger.facts.starterCards).toBe(32);
    expect(ledger.facts.boosterCards).toBe(8);
    expect(ledger.facts.boosterHolographicPerPack).toBe(1);
    const rows = mangaSanctuaryIngestPackshots();
    expect(rows.map((r) => r.slug).sort()).toEqual([
      "part1-starter-1190",
      "part1-starter-ennemis",
    ]);
    expect(rows.find((r) => r.slug === "part1-starter-ennemis")?.mint).toBe(
      true,
    );
  });
});
