import { describe, expect, it, vi } from "vitest";

import {
  createBarcodeLookupDeps,
  createBarcodeLookupTaskBuilders,
  createGameBarcodeEnrichmentDeps,
} from "@/services/provider/barcode";

function createDeps() {
  return {
    fetchMetadataFromPriceCharting: vi.fn(async () => null),
    fetchFromChasseAuxLivres: vi.fn(async () => []),
    fetchFromScanDex: vi.fn(async () => null),
    fetchFromAchatMoinsCher: vi.fn(async () => []),
    fetchFromFreakxy: vi.fn(async () => []),
    fetchFromApriloshop: vi.fn(async () => []),
    fetchFromPicClick: vi.fn(async () => []),
    fetchPricesFromLeDenicheur: vi.fn(async () => null),
    fetchFromOpenLibrary: vi.fn(async () => null),
    fetchFromGoogleBooks: vi.fn(async () => null),
    fetchFromDeezer: vi.fn(async () => null),
    fetchFromMusicBrainz: vi.fn(async () => null),
    fetchFromDiscogs: vi.fn(async () => null),
    fetchICollectMetadataByBarcode: vi.fn(async () => null),
  };
}

describe("createBarcodeLookupDeps", () => {
  it("assembles fetchers from provider modules", () => {
    const deps = createBarcodeLookupDeps();
    expect(typeof deps.fetchMetadataFromPriceCharting).toBe("function");
    expect(typeof deps.fetchFromChasseAuxLivres).toBe("function");
    expect(typeof deps.fetchFromScanDex).toBe("function");
    expect(typeof deps.fetchFromDiscogs).toBe("function");
  });
});

describe("createBarcodeLookupTaskBuilders", () => {
  it("creates expected task keys for each lookup type", () => {
    const builders = createBarcodeLookupTaskBuilders(createDeps());

    expect(
      Object.keys(builders.games({ barcode: "1", platformKey: "ps5" })).sort(),
    ).toEqual(
      [
        "pc",
        "cal",
        "sd",
        "amc",
        "freakxy",
        "apriloshop",
        "chipweld",
        "picclick",
        "leDenicheur",
        "ice",
        "tokyogamestory",
      ].sort(),
    );
    expect(Object.keys(builders.books({ barcode: "1" })).sort()).toEqual(
      ["ol", "googlebooks", "cal", "amc", "leDenicheur"].sort(),
    );
    expect(Object.keys(builders.musics({ barcode: "1" })).sort()).toEqual(
      [
        "mb",
        "discogs",
        "deezer",
        "cal",
        "amc",
        "picclick",
        "leDenicheur",
      ].sort(),
    );
    expect(Object.keys(builders.movies({ barcode: "1" })).sort()).toEqual(
      ["cal", "amc", "picclick", "leDenicheur"].sort(),
    );
    expect(Object.keys(builders.boardgames({ barcode: "1" })).sort()).toEqual(
      [
        "archichouette",
        "bcdjeux",
        "cal",
        "cestlejeu",
        "didacto",
        "fairplayjeux",
        "latelierdesjeux",
        "lepassetemps",
        "leDenicheur",
        "lesgentlemendujeu",
        "ludifolie",
        "ludocortex",
        "monsieurde",
        "philibert",
        "okkazeo",
        "sd",
        "amc",
        "picclick",
      ].sort(),
    );
    expect(Object.keys(builders.generic({ barcode: "1" })).sort()).toEqual(
      [
        "ol",
        "googlebooks",
        "deezer",
        "pc",
        "cal",
        "sd",
        "amc",
        "freakxy",
        "apriloshop",
        "chipweld",
        "picclick",
        "leDenicheur",
        "ice",
        "tokyogamestory",
        // Board-game anchors fire in generic too (parity), so a typeless scan
        // of a board game has a trusted source and isn't misclassified.
        "philibert",
        "okkazeo",
        "archichouette",
        "monsieurde",
        "ludifolie",
        "bcdjeux",
        "lepassetemps",
        "cestlejeu",
        "didacto",
        "fairplayjeux",
        "latelierdesjeux",
        "lesgentlemendujeu",
        "ludocortex",
      ].sort(),
    );
  });

  it("passes expected category and barcode arguments", () => {
    const deps = createDeps();
    const builders = createBarcodeLookupTaskBuilders(deps);

    builders.games({ barcode: "123", platformKey: "switch" });
    builders.books({ barcode: "456" });
    builders.musics({ barcode: "789" });
    builders.movies({ barcode: "234" });
    builders.boardgames({ barcode: "345" });
    builders.generic({ barcode: "567" });

    // The scan-time lookup also captures prices in the same pass.
    const withPrices = { withPrices: true };
    expect(deps.fetchFromChasseAuxLivres).toHaveBeenCalledWith(
      "123",
      "videogames",
      withPrices,
    );
    expect(deps.fetchFromChasseAuxLivres).toHaveBeenCalledWith(
      "456",
      "fr",
      withPrices,
    );
    expect(deps.fetchFromChasseAuxLivres).toHaveBeenCalledWith(
      "789",
      "music",
      withPrices,
    );
    expect(deps.fetchFromChasseAuxLivres).toHaveBeenCalledWith(
      "234",
      "dvd",
      withPrices,
    );
    expect(deps.fetchFromChasseAuxLivres).toHaveBeenCalledWith(
      "345",
      "toys",
      withPrices,
    );
    expect(deps.fetchFromChasseAuxLivres).toHaveBeenCalledWith(
      "567",
      "",
      withPrices,
    );
  });
});

describe("createGameBarcodeEnrichmentDeps", () => {
  it("assembles enrichment fetchers from provider modules", () => {
    const deps = createGameBarcodeEnrichmentDeps();
    expect(typeof deps.fetchReferencePriceByBarcode).toBe("function");
    expect(typeof deps.fetchGameMediaByBarcode).toBe("function");
    expect(typeof deps.fetchMovieByTitle).toBe("function");
  });
});
