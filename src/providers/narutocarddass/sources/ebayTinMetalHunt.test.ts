import { describe, expect, it } from "vitest";

import dig from "../curated/sources/ebay-tin-metal-hunt-2026-08-29.json";
import { ebayIngestPackshots } from "./ebayPackshots";
import { NARUTO_SEALED_SKUS } from "../sealedProducts";

describe("ebay-tin-metal-hunt", () => {
  it("does not mint Carddass FR tins from EN Shippuden listings", () => {
    expect(dig.verdict).toContain("Aucune tin Carddass FR");
    expect(dig.stillMissing).not.toContain("tin-box-hobby");
    expect(
      NARUTO_SEALED_SKUS.some((row) => row.slug === "tin-box-hobby"),
    ).toBe(true);
    expect(
      dig.listings.every(
        (row) =>
          row.id === "285342890666" ||
          (row.not ?? []).includes("carddass-fr") ||
          (row.not ?? []).includes("carddass-fr-tin"),
      ),
    ).toBe(true);
  });

  it("ingests the FR Storm 3 display as display-s28-fr", () => {
    const hit = dig.listings.find((row) => row.id === "285342890666");
    expect(hit?.sku).toBe("display-s28-fr");
    expect(hit?.ean).toBe("3391891969949");
    expect(
      ebayIngestPackshots().some((row) => row.slug === "display-s28-fr"),
    ).toBe(true);
    expect(
      NARUTO_SEALED_SKUS.find((row) => row.slug === "display-s28-fr"),
    ).toMatchObject({ lang: "FR", setCode: "s28", attested: true });
  });
});
