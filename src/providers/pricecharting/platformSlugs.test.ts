import { describe, expect, it } from "vitest";

import {
  getPriceChartingPlatformSlugs,
  priceChartingNeoGeoVariantMatchesShelf,
  resolvePriceChartingPlatformSlug,
} from "./platformSlugs";

describe("priceCharting platform slugs", () => {
  it("maps canonical platform keys to PriceCharting URL segments", () => {
    expect(getPriceChartingPlatformSlugs("wii")?.pal).toBe("pal-wii");
    expect(getPriceChartingPlatformSlugs("psvita")?.pal).toBe(
      "pal-playstation-vita",
    );
    expect(
      resolvePriceChartingPlatformSlug("PlayStation Vita", { isPal: true }),
    ).toBe("pal-playstation-vita");
  });

  it("resolves Neo Geo AES/MVS/CD slugs from shelf labels and barcodes", () => {
    expect(
      resolvePriceChartingPlatformSlug("NEO GEO AES+", {
        barcode: "4964808100880",
      }),
    ).toBe("jp-neo-geo-aes");
    expect(
      resolvePriceChartingPlatformSlug("Neo Geo AES", {
        barcode: "4012927150101",
      }),
    ).toBe("neo-geo-aes");
    expect(resolvePriceChartingPlatformSlug("Neo Geo MVS")).toBe("neo-geo-mvs");
    expect(
      priceChartingNeoGeoVariantMatchesShelf("Neo Geo MVS", "NEO GEO AES+"),
    ).toBe(false);
  });
});
