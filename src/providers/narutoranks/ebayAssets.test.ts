import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ebayBrowseItemId } from "@/providers/ebay/browseItem";

import { readEbayNinjaRanksLedger } from "./ebayAssets";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

describe("ebay-ninja-ranks ledger", () => {
  it("documents expired pick-a-card and live sell sheet", () => {
    const ledger = readEbayNinjaRanksLedger();
    expect(ledger.marketplaceId).toBe("EBAY_US");
    expect(
      ledger.listings.find((row) => row.legacyItemId === "293490000296")?.state,
    ).toBe("expired");
    expect(
      ledger.listings.find((row) => row.legacyItemId === "403984180609")
        ?.ingest,
    ).toBe("staging");
    expect(ebayBrowseItemId("127955574207", "429137825416")).toBe(
      "v1|127955574207|429137825416",
    );
  });
});
