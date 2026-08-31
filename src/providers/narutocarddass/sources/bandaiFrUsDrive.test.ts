import { describe, expect, it } from "vitest";

import {
  bandaiFrUsDriveIngestPackshots,
  bandaiFrUsDriveLedger,
  bandaiFrUsDriveNewEnDisplays,
} from "./bandaiFrUsDrive";

describe("bandaiFrUsDrive", () => {
  it("points at the Bandai FR/US hub and stages Kayou/Panini outside Carddass", () => {
    const ledger = bandaiFrUsDriveLedger();
    expect(ledger.hub.folderId).toBe("1V1bqHi6SpJznGids8-o8Y9vQ2gb8aV07");
    expect(ledger.branches.fr.docs.length).toBe(2);
    expect(ledger.branches.us.folders.Decks.empty).toBe(true);
    expect(ledger.branches.us.folders["Tin box"].empty).toBe(true);
    expect(ledger.relatedOutsideHub.kayou.not).toContain("carddass");
    expect(ledger.relatedOutsideHub.paniniNinjaRanks.not).toContain("carddass");
    expect(ledger.not).toContain("mint-display-s1-s6");
  });

  it("ingests only EN SKUs that do not collide with Carddass FR displays s1–s6", () => {
    const rows = bandaiFrUsDriveIngestPackshots();
    expect(rows.length).toBeGreaterThanOrEqual(20);
    expect(
      rows.every((row) =>
        String(row.staging).startsWith("staging/bandai-fr-us-drive/"),
      ),
    ).toBe(true);
    expect(
      rows.some(
        (row) =>
          row.slug === "display-s1" ||
          row.slug === "display-s2" ||
          row.slug === "booster-s1",
      ),
    ).toBe(false);
    expect(rows.some((row) => row.slug === "booster-s5-en")).toBe(true);
    expect(rows.some((row) => row.slug === "display-s13")).toBe(true);
  });

  it("mints EN display SKUs for s7–s12 from Drive packshots", () => {
    const sets = bandaiFrUsDriveNewEnDisplays().map((row) => row.set);
    expect(sets).toEqual(["s7", "s8", "s9", "s10", "s11", "s12"]);
  });
});
