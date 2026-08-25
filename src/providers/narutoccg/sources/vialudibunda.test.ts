import { describe, expect, it } from "vitest";

import {
  magentoCatalogOriginal,
  vialudibundaIngestPackshots,
  vialudibundaLedger,
} from "./vialudibunda";

describe("Via Ludibunda Magento packshots", () => {
  it("drops the Magento size cache, keeps the catalog original", () => {
    expect(
      magentoCatalogOriginal(
        "https://vialudibunda.com/media/catalog/product/cache/2/image/700x700/9df78eab33525d08d6e5fb8d27136e95/n/a/naruto-serie-1-booster.jpg",
      ),
    ).toBe(
      "https://vialudibunda.com/media/catalog/product/n/a/naruto-serie-1-booster.jpg",
    );
    expect(
      magentoCatalogOriginal(
        "https://vialudibunda.com/media/catalog/product/cache/1/image/988x988/9df78eab33525d08d6e5fb8d27136e95/n/a/naruto-serie-1-booster.jpg",
      ),
    ).toBe(
      "https://vialudibunda.com/media/catalog/product/n/a/naruto-serie-1-booster.jpg",
    );
    expect(
      magentoCatalogOriginal(
        "https://vialudibunda.com/media/catalog/product/cache/1/image/988x988/9df78eab33525d08d6e5fb8d27136e95/s/t/starter-naruto-serie-1-maitre-hokage.jpg",
      ),
    ).toBe(
      "https://vialudibunda.com/media/catalog/product/s/t/starter-naruto-serie-1-maitre-hokage.jpg",
    );
    expect(
      magentoCatalogOriginal(
        "https://vialudibunda.com/media/catalog/product/s/t/starter-naruto-serie-1-maitre-hokage.jpg",
      ),
    ).toBe(
      "https://vialudibunda.com/media/catalog/product/s/t/starter-naruto-serie-1-maitre-hokage.jpg",
    );
  });

  it("dumps the three live S1 SKUs and does not invent S2+", () => {
    const ledger = vialudibundaLedger();
    expect(vialudibundaIngestPackshots().map((row) => row.slug)).toEqual([
      "booster-s1",
      "starter-pays-du-vent",
      "starter-maitre-hokage",
    ]);
    expect(ledger.products.every((row) => !row.url.includes("/cache/"))).toBe(
      true,
    );
    expect(
      ledger.products.map((row) =>
        "printedRef" in row ? row.printedRef : null,
      ),
    ).toEqual(["05112", "05110", null]);
    const hokage = ledger.products.find(
      (row) => row.slug === "starter-maitre-hokage",
    )!;
    expect(hokage.url).toContain(
      "/s/t/starter-naruto-serie-1-maitre-hokage.jpg",
    );
    expect(hokage.url).not.toContain("/n/a/");
    expect(hokage.doNotDisplace).toBe(
      "staging/trictrac/starter-maitre-hokage.jpeg",
    );
    expect(ledger.search.hits).toBe(3);
  });
});
