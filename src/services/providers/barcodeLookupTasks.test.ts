import { describe, expect, it, vi } from "vitest";

import { createBarcodeLookupTaskBuilders } from "./barcodeLookupTasks";

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
    fetchFromDeezer: vi.fn(async () => null),
    fetchFromMusicBrainz: vi.fn(async () => null),
    fetchFromDiscogs: vi.fn(async () => null),
  };
}

describe("createBarcodeLookupTaskBuilders", () => {
  it("creates expected task keys for each lookup type", () => {
    const builders = createBarcodeLookupTaskBuilders(createDeps());

    expect(Object.keys(builders.games({ barcode: "1", platformKey: "ps5" }))).toEqual([
      "pc",
      "cal",
      "sd",
      "amc",
      "freakxy",
      "aprilo",
      "picclick",
      "leDenicheur",
    ]);
    expect(Object.keys(builders.books({ barcode: "1" }))).toEqual([
      "ol",
      "cal",
      "amc",
      "leDenicheur",
    ]);
    expect(Object.keys(builders.musics({ barcode: "1" }))).toEqual([
      "mb",
      "discogs",
      "deezer",
      "cal",
      "amc",
      "picclick",
      "leDenicheur",
    ]);
    expect(Object.keys(builders.movies({ barcode: "1" }))).toEqual([
      "cal",
      "amc",
      "picclick",
      "leDenicheur",
    ]);
    expect(Object.keys(builders.boardgames({ barcode: "1" }))).toEqual([
      "cal",
      "amc",
      "picclick",
      "leDenicheur",
    ]);
    expect(Object.keys(builders.generic({ barcode: "1" }))).toEqual([
      "ol",
      "deezer",
      "pc",
      "cal",
      "sd",
      "amc",
      "freakxy",
      "aprilo",
      "picclick",
      "leDenicheur",
    ]);
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

    expect(deps.fetchFromChasseAuxLivres).toHaveBeenCalledWith("123", "jeuxvideo");
    expect(deps.fetchFromChasseAuxLivres).toHaveBeenCalledWith("456", "fr");
    expect(deps.fetchFromChasseAuxLivres).toHaveBeenCalledWith("789", "music");
    expect(deps.fetchFromChasseAuxLivres).toHaveBeenCalledWith("234", "dvd");
    expect(deps.fetchFromChasseAuxLivres).toHaveBeenCalledWith("345", "toys");
    expect(deps.fetchFromChasseAuxLivres).toHaveBeenCalledWith("567", "");
  });
});
