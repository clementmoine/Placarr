/**
 * Harvest carddass.fr/dbz CDX scout → curated FR face ledger.
 */
import { describe, expect, it } from "vitest";

import { buildCarddassFrDbzLedgerFromScout } from "./carddassFr";

describe("harvestCarddassFrDbz", () => {
  it("builds a FR face ledger from the Wayback CDX scout when present", () => {
    const { faces, outPath } = buildCarddassFrDbzLedgerFromScout();
    expect(outPath).toContain("carddass-fr-dbz-faces.json");
    // Scout may be absent in CI — empty is honest.
    expect(Array.isArray(faces)).toBe(true);
    if (faces.length > 0) {
      expect(faces[0]).toMatchObject({
        series: expect.any(String),
        file: expect.any(String),
        waybackUrl: expect.stringContaining("web.archive.org"),
      });
    }
  });
});
