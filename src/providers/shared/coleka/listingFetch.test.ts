import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { keepStagedListingCards } from "./listingFetch";

function stagedCards(cards: Array<{ number: string; name: string }>): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "coleka-listing-"));
  const file = path.join(dir, "cards.json");
  writeFileSync(file, JSON.stringify({ cards }));
  return file;
}

describe("keepStagedListingCards", () => {
  it("keeps cards already staged when a listing page was walled", () => {
    // Sage's Legacy FR, 2026-11-22 : page 2 behind the Coleka wall → 72 of
    // 120 singles, and the rebuilt index lost 48 FR titles.
    const file = stagedCards([
      { number: "001", name: "ancien" },
      { number: "099", name: "page 2" },
    ]);
    const byNumber = new Map([["001", { number: "001", name: "relu" }]]);

    keepStagedListingCards(byNumber, file, 1);

    expect([...byNumber.values()]).toEqual([
      { number: "001", name: "relu" },
      { number: "099", name: "page 2" },
    ]);
  });

  it("trusts a complete read (no page missing)", () => {
    const file = stagedCards([{ number: "099", name: "retirée" }]);
    const byNumber = new Map([["001", { number: "001", name: "relu" }]]);
    keepStagedListingCards(byNumber, file, 0);
    expect([...byNumber.keys()]).toEqual(["001"]);
  });

  it("ignores a missing or unreadable staging file", () => {
    const byNumber = new Map([["001", { number: "001", name: "relu" }]]);
    keepStagedListingCards(byNumber, "/nope/cards.json", 2);
    expect([...byNumber.keys()]).toEqual(["001"]);
  });
});
