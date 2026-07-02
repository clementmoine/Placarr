import { describe, expect, it } from "vitest";

import { scrapeCatalogRetailerLookupEntries } from "./scrapeRetailers";

describe("scrapeCatalogRetailers", () => {
  it("lists PrestaShop and Shopify retailers from registered modules", () => {
    const entries = scrapeCatalogRetailerLookupEntries();
    expect(entries.some((entry) => entry.lookupKey === "monsieurde")).toBe(true);
    expect(entries.some((entry) => entry.lookupKey === "latelierdesjeux")).toBe(
      true,
    );
    expect(
      entries.find((entry) => entry.lookupKey === "monsieurde")?.providerName,
    ).toBe("Monsieur de");
  });
});
