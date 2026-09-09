import { describe, expect, it } from "vitest";

import {
  scifiUniverseIngestPackshots,
  scifiUniverseLedger,
} from "./scifiUniverse";

describe("SciFi-Universe Naruto JCC packshots", () => {
  it("keeps the 200px unique SKUs as last-resort dumps", () => {
    const ledger = scifiUniverseLedger();
    expect(ledger.ingest).toBe("packshots");
    expect(ledger.missing).toEqual(["s5"]);
    expect(scifiUniverseIngestPackshots().map((row) => row.slug)).toEqual([
      "starter-pays-du-vent",
      "starter-maitre-hokage",
      "booster-s2",
      "starter-sceller-le-malefice",
      "starter-detruire-konoha",
      "booster-s4",
    ]);
    expect(
      ledger.products.filter((row) => !row.ingest).map((row) => row.id),
    ).toEqual([11651, 15061, 17700]);
    const boosterS1 = ledger.products.find((row) => row.id === 11651)!;
    expect(boosterS1.url).toContain("10095-naruto-jcc.jpg");
  });
});
