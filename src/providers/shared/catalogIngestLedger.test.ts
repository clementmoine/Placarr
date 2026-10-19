import { describe, expect, it } from "vitest";

import {
  catalogArtefactIsFresh,
  catalogArtefactIsFreshWithin,
  emptyCatalogIngestLedger,
} from "./catalogIngestLedger";

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-10-19T12:00:00.000Z");

function ledgerWith(promotedAt: string) {
  const ledger = emptyCatalogIngestLedger();
  ledger.entries["a"] = { artefactId: "a", contentHash: "h", promotedAt };
  return ledger;
}

describe("catalogArtefactIsFreshWithin", () => {
  it("is true when hash matches and age < maxAge", () => {
    const l = ledgerWith(new Date(NOW.getTime() - HOUR).toISOString());
    expect(catalogArtefactIsFreshWithin(l, "a", "h", 12 * HOUR, NOW)).toBe(true);
  });

  it("is false when hash matches but age >= maxAge", () => {
    const l = ledgerWith(new Date(NOW.getTime() - 12 * HOUR).toISOString());
    expect(catalogArtefactIsFreshWithin(l, "a", "h", 12 * HOUR, NOW)).toBe(false);
    expect(catalogArtefactIsFresh(l, "a", "h")).toBe(true); // hash-only unchanged
  });

  it("is false on hash mismatch, missing entry or bad date", () => {
    const l = ledgerWith(NOW.toISOString());
    expect(catalogArtefactIsFreshWithin(l, "a", "x", 12 * HOUR, NOW)).toBe(false);
    expect(catalogArtefactIsFreshWithin(l, "nope", "h", 12 * HOUR, NOW)).toBe(false);
    expect(
      catalogArtefactIsFreshWithin(ledgerWith("garbage"), "a", "h", 12 * HOUR, NOW),
    ).toBe(false);
  });
});
