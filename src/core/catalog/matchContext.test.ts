import { describe, expect, it } from "vitest";

import {
  buildMatchContext,
  matchAcceptanceTitles,
  matchInputsFromMetadataResults,
  matchLookupTitles,
  matchPriceSeekQueries,
  matchPrimaryBarcode,
  toBarcodePriceRefreshContext,
  withMatchOnAdapterContext,
} from "./matchContext";

describe("buildMatchContext", () => {
  it("merges barcodes, aliases, and releaseDate for all providers", () => {
    const match = buildMatchContext({
      shelfType: "games",
      shelfName: "PlayStation 4",
      primaryTitle: "FIFA 17",
      titles: ["FIFA 17", "Fifa Football 17", "FIFA Soccer 17"],
      acceptanceTitles: ["FIFA 17"],
      barcodes: ["0711719504120", "711719504120"],
      releaseDate: "2016-09-27",
      externalIds: { igdb: "123", screenscraper: "456" },
    });

    expect(match.barcodes).toEqual(["0711719504120", "711719504120"]);
    expect(match.primaryTitle).toBe("FIFA 17");
    expect(matchLookupTitles(match)).toEqual([
      "FIFA 17",
      "Fifa Football 17",
      "FIFA Soccer 17",
    ]);
    expect(matchAcceptanceTitles(match)).toEqual(["FIFA 17"]);
    expect(match.releaseDate).toBe("2016-09-27");
    expect(match.platformKey).toBe("ps4");
    expect(match.externalIds).toEqual({ igdb: "123", screenscraper: "456" });
  });

  it("dedupes titles and barcodes case-insensitively / digits-only", () => {
    const match = buildMatchContext({
      shelfType: "books",
      shelfName: "BD",
      primaryTitle: "Astérix",
      titles: ["Astérix", "asterix", "Astérix le Gaulois"],
      barcodes: ["978-2-01-210133-3", "9782012101333"],
    });

    expect(match.titles).toEqual(["Astérix", "Astérix le Gaulois"]);
    expect(match.barcodes).toEqual(["9782012101333"]);
    expect(matchPrimaryBarcode(match)).toBe("9782012101333");
  });

  it("marks NTSC when region hints say so", () => {
    const match = buildMatchContext({
      shelfType: "games",
      shelfName: "Xbox",
      primaryTitle: "Halo",
      regionHints: ["Halo NTSC"],
    });
    expect(match.isPal).toBe(false);
  });

  it("prefers barcode region over title/shelf NTSC hints", () => {
    const pal = buildMatchContext({
      shelfType: "games",
      shelfName: "Xbox Original",
      primaryTitle: "Voodoo Vince",
      barcodes: ["805529493537"],
      regionHints: ["Voodoo Vince NTSC"],
    });
    expect(pal.isPal).toBe(true);

    const ntsc = buildMatchContext({
      shelfType: "games",
      shelfName: "Xbox",
      primaryTitle: "Halo",
      barcodes: ["045496365226"],
    });
    expect(ntsc.isPal).toBe(false);
  });
  it("aggregates provider contributions for the next match pass", () => {
    const contributed = matchInputsFromMetadataResults([
      {
        title: "FIFA 17",
        aliases: ["Fifa Football 17"],
        barcode: "0711719504120",
        releaseDate: "2016-09-27",
        externalIds: { igdb: "123" },
      },
      {
        title: "FIFA 17",
        aliases: ["FIFA Soccer 17"],
        barcode: "711719504120",
        externalIds: { screenscraper: "456" },
      },
    ]);

    expect(contributed.titles).toEqual(
      expect.arrayContaining([
        "FIFA 17",
        "Fifa Football 17",
        "FIFA Soccer 17",
      ]),
    );
    expect(contributed.barcodes).toEqual([
      "0711719504120",
      "711719504120",
    ]);
    expect(contributed.releaseDate).toBe("2016-09-27");
    expect(contributed.externalIds).toEqual({
      igdb: "123",
      screenscraper: "456",
    });
  });
});

describe("toBarcodePriceRefreshContext", () => {
  it("exposes legacy aliases while keeping MatchContext fields", () => {
    const match = buildMatchContext({
      shelfType: "games",
      shelfName: "PlayStation",
      primaryTitle: "Tony Hawk's Pro Skater 4",
      titles: ["Tony Hawk's Pro Skater 4", "Tony Hawk 4"],
      barcodes: ["711719423803"],
    });
    const ctx = toBarcodePriceRefreshContext(match, {
      expandSearchQueries: true,
    });

    expect(ctx.cleanedBarcode).toBe("711719423803");
    expect(ctx.primaryName).toBe("Tony Hawk's Pro Skater 4");
    // Soft titles stay aliases — expansions live in fallbackNames only.
    expect(ctx.titles).toEqual([
      "Tony Hawk's Pro Skater 4",
      "Tony Hawk 4",
    ]);
    expect(ctx.fallbackNames).toEqual(
      expect.arrayContaining(["Tony Hawk 4"]),
    );
    expect(ctx.leDenicheurQueries[0]).toBe("711719423803");
    expect(ctx.releaseDate).toBeNull();
  });

  it("does not promote media-hint queries ahead of the primary title", () => {
    const match = buildMatchContext({
      shelfType: "movies",
      shelfName: "Bluray",
      primaryTitle: "Inception",
      titles: ["Inception"],
    });
    const ctx = toBarcodePriceRefreshContext(match, {
      expandSearchQueries: true,
    });

    expect(ctx.primaryName).toBe("Inception");
    expect(ctx.titles[0]).toBe("Inception");
    expect(ctx.fallbackNames).toEqual(
      expect.arrayContaining(["Inception bluray"]),
    );
  });

  it("includes every barcode in leDenicheurQueries and seek queries", () => {
    const match = buildMatchContext({
      shelfType: "books",
      shelfName: "BD",
      primaryTitle: "Astérix",
      titles: ["Astérix"],
      barcodes: ["9782012101333", "201210133X"],
    });
    const ctx = toBarcodePriceRefreshContext(match, {
      expandSearchQueries: true,
    });

    expect(ctx.barcodes).toEqual(["9782012101333", "201210133"]);
    expect(ctx.leDenicheurQueries.slice(0, 2)).toEqual([
      "9782012101333",
      "201210133",
    ]);
    expect(matchPriceSeekQueries(ctx)[0]).toBe("9782012101333");
    expect(matchPriceSeekQueries(ctx)).toEqual(
      expect.arrayContaining(["201210133", "Astérix"]),
    );
  });

  it("caps title seeks when the alias bag is large", () => {
    const match = buildMatchContext({
      shelfType: "games",
      shelfName: "PlayStation 2",
      primaryTitle: "James Bond 007 Nightfire",
      titles: [
        "James Bond 007 Nightfire",
        "007: Nightfire",
        "Nightfire",
        "James Bond 007: Nightfire",
        "PS2 James Bond 007: Nightfire",
        "James Bond 007 ... Nightfire",
        "007 나이트파이어",
      ],
      barcodes: ["5030930035983"],
    });
    const ctx = toBarcodePriceRefreshContext(match, {
      expandSearchQueries: true,
    });
    const queries = matchPriceSeekQueries(ctx);
    expect(queries[0]).toBe("5030930035983");
    expect(queries.filter((q) => !/^\d+$/.test(q)).length).toBeLessThanOrEqual(
      1,
    );
  });

  it("allows two title seeks when there is no barcode", () => {
    const queries = matchPriceSeekQueries({
      barcodes: [],
      cleanedBarcode: "",
      primaryName: "Super Picsou Géant n°113",
      fallbackNames: [
        "Super Picsou Géant 113",
        "Super Picsou GEANT 113 Bis",
        "Super Picsou Géant n°113 | Bon état",
      ],
    });
    expect(queries).toHaveLength(2);
    expect(queries[0]).toBe("Super Picsou Géant n°113");
  });
});

describe("withMatchOnAdapterContext", () => {
  it("overlays match titles / barcode / releaseDate onto adapter context", () => {
    const match = buildMatchContext({
      shelfType: "movies",
      shelfName: "Bluray",
      primaryTitle: "Inception",
      titles: ["Inception", "Origine"],
      barcodes: ["5051889071234"],
      releaseDate: "2010-07-16",
      externalIds: { imdb: "tt1375666" },
    });
    const adapter = withMatchOnAdapterContext(
      {
        name: "Inception",
        type: "movies",
        barcode: null,
      },
      match,
    );

    expect(adapter.match).toBe(match);
    expect(adapter.barcode).toBe("5051889071234");
    expect(adapter.fallbackNames).toEqual(["Origine"]);
    expect(adapter.releaseDate).toBe("2010-07-16");
    expect(adapter.externalIds?.imdb).toBe("tt1375666");
  });
});
