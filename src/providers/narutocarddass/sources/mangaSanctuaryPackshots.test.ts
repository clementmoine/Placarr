import { describe, expect, it } from "vitest";

import {
  mangaSanctuaryIngestPackshots,
  mangaSanctuaryPackshotLedger,
} from "./mangaSanctuaryPackshots";

describe("mangaSanctuaryPackshots", () => {
  it("ingests the three S5 press packshots only", () => {
    const ledger = mangaSanctuaryPackshotLedger();
    expect(ledger.page).toContain("manga-sanctuary.com/news/7397");
    const rows = mangaSanctuaryIngestPackshots();
    expect(rows.map((r) => r.slug).sort()).toEqual([
      "booster-s5",
      "starter-la-quete",
      "starter-un-nouveau-depart",
    ]);
    expect(rows.every((r) => r.staging.startsWith("staging/manga-sanctuary/"))).toBe(
      true,
    );
    expect(ledger.skip.length).toBeGreaterThanOrEqual(2);
  });
});
