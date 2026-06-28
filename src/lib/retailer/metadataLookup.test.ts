import { describe, expect, it } from "vitest";

import { isRetailerCatalogTitleAccepted } from "@/lib/retailer/metadataAcceptance";
import { buildBoardGameMetadataSearchQueries } from "@/lib/metadata/boardGame";
import {
  acceptRetailerCatalogCandidate,
  isShelfOnlyBundleLookupQuery,
  retailerSearchQueryUsesOnlyInputTokens,
} from "@/lib/retailer/metadataLookup";

describe("retailer metadata lookup policy", () => {
  it("flags shelf-only bundle queries", () => {
    expect(
      isShelfOnlyBundleLookupQuery({
        requestedName: "Alpha + Beta",
        searchQuery: "Ma Collection",
        shelfName: "Ma Collection",
      }),
    ).toBe(true);
    expect(
      isShelfOnlyBundleLookupQuery({
        requestedName: "Alpha + Beta",
        searchQuery: "Ma Collection Alpha",
        shelfName: "Ma Collection",
      }),
    ).toBe(false);
  });

  it("rejects shelf-prefix false positives unless bundle scenarios match", () => {
    expect(
      acceptRetailerCatalogCandidate({
        requestedName: "Alpha + Beta",
        searchQuery: "Ma Collection",
        shelfName: "Ma Collection",
        catalogTitle: "Ma Collection - Extension Gamma",
      }),
    ).toBe(false);

    expect(
      acceptRetailerCatalogCandidate({
        requestedName: "Alpha + Beta",
        searchQuery: "Ma Collection",
        shelfName: "Ma Collection",
        catalogTitle: "Line - Alpha / Beta",
        catalogAliases: ["Box set Alpha + Beta"],
      }),
    ).toBe(true);
  });

  it("rejects generic edition/platform search queries that match another game", () => {
    const cultOfTheLamb = "Cult of the Lamb Deluxe Edition PS5";
    const genericQuery = "Deluxe Edition PS5";
    const games = [
      "Alan Wake II Deluxe Edition",
      "Gris Deluxe Edition",
      "Baldur's Gate 3 Deluxe Edition",
      "Neva Deluxe Edition",
      "Soul Reaver 1 and 2 Remastered Deluxe Edition",
    ];

    for (const requestedName of games) {
      expect(
        isRetailerCatalogTitleAccepted({
          requestedName,
          searchQuery: genericQuery,
          catalogTitle: cultOfTheLamb,
        }),
      ).toBe(false);
    }
  });

  it("rejects barcode-confirmed cult-of-the-lamb hits for unrelated deluxe games", () => {
    expect(
      isRetailerCatalogTitleAccepted({
        requestedName: "Gris - Deluxe Edition",
        catalogTitle: "Cult of the Lamb Deluxe Edition PS5",
        barcodeConfirmed: true,
      }),
    ).toBe(false);
  });

  it("accepts barcode-confirmed short-title retailer listings", () => {
    expect(
      isRetailerCatalogTitleAccepted({
        requestedName: "Catan",
        catalogTitle: "Catan — Édition FR",
        barcodeConfirmed: true,
      }),
    ).toBe(true);
  });

  it("rejects ps4 catalog hits on a ps5 shelf", () => {
    expect(
      acceptRetailerCatalogCandidate({
        requestedName: "Hogwarts Legacy L'Heritage De Poudlard",
        shelfName: "Playstation 5",
        catalogTitle: "Hogwarts Legacy L'Heritage De Poudlard PS4",
      }),
    ).toBe(false);

    expect(
      acceptRetailerCatalogCandidate({
        requestedName: "Hogwarts Legacy L'Heritage De Poudlard",
        shelfName: "Playstation 5",
        catalogTitle: "Hogwarts Legacy L'Heritage De Poudlard PS5",
      }),
    ).toBe(true);
  });

  it("rejects barcode-confirmed sequel mismatches (Part I vs Part II)", () => {
    expect(
      isRetailerCatalogTitleAccepted({
        requestedName: "The Last of Us Part I",
        shelfName: "Playstation 5",
        catalogTitle: "The Last of Us Part II PS4",
        barcodeConfirmed: true,
      }),
    ).toBe(false);

    expect(
      isRetailerCatalogTitleAccepted({
        requestedName: "The Last of Us Part I",
        shelfName: "Playstation 5",
        catalogTitle: "The Last of Us Part I PS5",
        barcodeConfirmed: true,
      }),
    ).toBe(true);
  });

  it("rejects barcode-confirmed wrong platform on platform shelf", () => {
    expect(
      isRetailerCatalogTitleAccepted({
        requestedName: "Hogwarts Legacy L'Heritage De Poudlard",
        shelfName: "Playstation 5",
        catalogTitle: "Hogwarts Legacy L'Heritage De Poudlard PS4",
        barcodeConfirmed: true,
      }),
    ).toBe(false);
  });

  it("still accepts a shorter identity query for the same deluxe game", () => {
    expect(
      isRetailerCatalogTitleAccepted({
        requestedName: "Alan Wake II Deluxe Edition",
        searchQuery: "Alan Wake II",
        catalogTitle: "Alan Wake II Deluxe Edition PS5",
      }),
    ).toBe(true);

    expect(
      isRetailerCatalogTitleAccepted({
        requestedName: "Tekken 7 Deluxe Edition",
        searchQuery: "Tekken 7",
        catalogTitle: "Tekken 7 Deluxe Edition PS5",
      }),
    ).toBe(true);
  });

  it("never injects tokens outside the item title and shelf name", () => {
    const cases = [
      { name: "Scenario A + Scenario B", shelf: "Jeux Ambiance" },
      { name: "Horreur", shelf: "Escape Room" },
      { name: "Catan", shelf: "Jeux de société" },
    ];

    for (const { name, shelf } of cases) {
      const queries = buildBoardGameMetadataSearchQueries(name, shelf);
      for (const query of queries) {
        expect(retailerSearchQueryUsesOnlyInputTokens(query, name, shelf)).toBe(
          true,
        );
      }
    }
  });
});
