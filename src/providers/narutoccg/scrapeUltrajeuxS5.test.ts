import { describe, expect, it } from "vitest";

import ledger from "./curated/sources/ultrajeux-s5.json";
import { ultrajeuxWaybackUrl } from "./scrapeUltrajeuxS5";

describe("Ultrajeux S5 holes", () => {
  it("targets the six CDX-missing official scans, not the whole serie_5 tree", () => {
    expect(ledger.ingest).toBe("s5-holes");
    expect(ledger.holes.map((row) => row.number)).toEqual([
      "ni232",
      "ni236",
      "ni252",
      "ni253",
      "ta221",
      "ta226",
    ]);
    expect(ultrajeuxWaybackUrl("ta-221.jpg", "20190228114039")).toContain(
      "/serie_5/ta-221.jpg",
    );
    expect(ultrajeuxWaybackUrl("ta-221.jpg", "20190228114039")).toContain(
      "20190228114039id_",
    );
  });
});
