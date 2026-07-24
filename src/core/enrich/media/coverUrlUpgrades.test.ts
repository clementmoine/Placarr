import { describe, expect, it } from "vitest";

import {
  bestStructuralCoverUrl,
  structuralCoverDownloadCandidates,
} from "./coverUrlUpgrades";

describe("structuralCoverDownloadCandidates", () => {
  it("upgrades eBay Browse thumbnails to larger CDN sizes first", () => {
    const url = "https://i.ebayimg.com/images/g/UQ0AAOSwUfBglr-b/s-l225.jpg";
    expect(structuralCoverDownloadCandidates(url)).toEqual([
      "https://i.ebayimg.com/images/g/UQ0AAOSwUfBglr-b/s-l1600.jpg",
      "https://i.ebayimg.com/images/g/UQ0AAOSwUfBglr-b/s-l500.jpg",
      "https://i.ebayimg.com/images/g/UQ0AAOSwUfBglr-b/s-l400.jpg",
      "https://i.ebayimg.com/images/g/UQ0AAOSwUfBglr-b/s-l300.jpg",
      url,
    ]);
    expect(bestStructuralCoverUrl(url)).toBe(
      "https://i.ebayimg.com/images/g/UQ0AAOSwUfBglr-b/s-l1600.jpg",
    );
  });

  it("upgrades Open Library -M covers to -L", () => {
    const url = "https://covers.openlibrary.org/b/id/12345-M.jpg";
    expect(bestStructuralCoverUrl(url)).toBe(
      "https://covers.openlibrary.org/b/id/12345-L.jpg",
    );
  });

  it("upgrades TMDB poster sizes to original", () => {
    const url = "https://image.tmdb.org/t/p/w500/abc.jpg";
    expect(bestStructuralCoverUrl(url)).toBe(
      "https://image.tmdb.org/t/p/original/abc.jpg",
    );
  });

  it("upgrades IGDB cover tokens to cover_big", () => {
    const url =
      "https://images.igdb.com/igdb/image/upload/t_cover_small/co6r83.jpg";
    expect(bestStructuralCoverUrl(url)).toBe(
      "https://images.igdb.com/igdb/image/upload/t_cover_big/co6r83.jpg",
    );
  });

  it("upgrades PriceCharting numeric CDN suffixes", () => {
    const url =
      "https://storage.googleapis.com/images.pricecharting.com/abc/240.jpg";
    expect(bestStructuralCoverUrl(url)).toBe(
      "https://storage.googleapis.com/images.pricecharting.com/abc/1600.jpg",
    );
  });
});
