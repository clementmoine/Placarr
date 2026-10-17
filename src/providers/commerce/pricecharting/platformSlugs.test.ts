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

  it("maps modern consoles including Xbox One (FIFA 17 direct URLs)", () => {
    expect(getPriceChartingPlatformSlugs("xboxone")).toEqual({
      pal: "pal-xbox-one",
      default: "xbox-one",
    });
    expect(resolvePriceChartingPlatformSlug("Xbox One", { isPal: true })).toBe(
      "pal-xbox-one",
    );
    expect(resolvePriceChartingPlatformSlug("Xbox One")).toBe("xbox-one");
    expect(getPriceChartingPlatformSlugs("ps4")?.default).toBe("playstation-4");
    expect(getPriceChartingPlatformSlugs("switch")?.pal).toBe(
      "pal-nintendo-switch",
    );
    expect(getPriceChartingPlatformSlugs("xboxseries")?.default).toBe(
      "xbox-series-x",
    );
  });

  it("maps handheld / Sega / Atari shelves used in Placarr", () => {
    expect(
      resolvePriceChartingPlatformSlug("Game Boy Advance", { isPal: true }),
    ).toBe("pal-gameboy-advance");
    expect(
      resolvePriceChartingPlatformSlug("Mega Drive", { isPal: true }),
    ).toBe("pal-sega-mega-drive");
    expect(resolvePriceChartingPlatformSlug("Mega Drive")).toBe("sega-genesis");
    expect(resolvePriceChartingPlatformSlug("Dreamcast", { isPal: true })).toBe(
      "pal-dreamcast",
    );
    expect(resolvePriceChartingPlatformSlug("Saturn")).toBe("sega-saturn");
    expect(
      resolvePriceChartingPlatformSlug("Atari 2600", { isPal: true }),
    ).toBe("pal-atari-2600");
    expect(
      resolvePriceChartingPlatformSlug("Nintendo Switch 2", { isPal: true }),
    ).toBe("pal-nintendo-switch-2");
    expect(resolvePriceChartingPlatformSlug("PC")).toBe("pc-games");
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
