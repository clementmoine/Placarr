import { describe, expect, it } from "vitest";

import { presentItem, presentItemFromStorage } from "@/core/collect/present";
import {
  buildCatalogExternalLink,
  resolveCatalogExternalLink,
} from "@/core/enrich/catalogLink";

describe("buildCatalogExternalLink", () => {
  it("builds an honest search link (no invented /game/ slug)", () => {
    const link = buildCatalogExternalLink({
      mediaType: "games",
      title: "Mario Kart Wii",
      shelfName: "Nintendo Wii",
      barcode: "3307211503465",
    });
    expect(link?.isDirect).toBe(false);
    expect(link?.url).toContain("pricecharting.com");
    expect(link?.url).toContain("search-products");
    expect(link?.url).toContain("Mario");
    expect(link?.providerLabel).toBe("PriceCharting");
  });

  it("skips non-game media types", () => {
    expect(
      buildCatalogExternalLink({
        mediaType: "books",
        title: "1984",
        shelfName: "Livres",
      }),
    ).toBeNull();
  });
});

describe("resolveCatalogExternalLink", () => {
  it("prefers a scraped /game/ catalog fact over search", () => {
    const link = resolveCatalogExternalLink(
      {
        mediaType: "games",
        title: "Tony Hawk's Pro Skater 4",
        shelfName: "PlayStation 1",
        barcode: "5030917018572",
      },
      [
        {
          kind: "external-link",
          source: "PriceCharting",
          label: "PriceCharting",
          value: "Tony Hawk 4",
          url: "https://www.pricecharting.com/game/pal-playstation/tony-hawk-4",
        },
      ],
    );
    expect(link).toEqual({
      url: "https://www.pricecharting.com/game/pal-playstation/tony-hawk-4",
      isDirect: true,
      providerLabel: "PriceCharting",
    });
  });
});

describe("presentItem referenceCatalogLink", () => {
  it("attaches a catalog link for game shelves", () => {
    const presented = presentItem({
      name: "Mario Kart Wii",
      barcode: "3307211503465",
      shelf: { type: "games", name: "Nintendo Wii" },
      metadata: { title: "Mario Kart Wii" },
    });
    expect(presented.referenceCatalogLink?.url).toContain("pricecharting.com");
    expect(presented.referenceCatalogLink?.providerLabel).toBe("PriceCharting");
  });

  it("uses the scraped PriceCharting game URL when present in facts", () => {
    const presented = presentItem({
      name: "Tony Hawk's Pro Skater 4",
      barcode: "5030917018572",
      shelf: { type: "games", name: "PlayStation 1" },
      metadata: {
        title: "Tony Hawk's Pro Skater 4",
        facts: [
          {
            kind: "external-link",
            source: "PriceCharting",
            label: "PriceCharting",
            url: "https://www.pricecharting.com/game/pal-playstation/tony-hawk-4",
          },
        ],
      },
    });
    expect(presented.referenceCatalogLink?.url).toBe(
      "https://www.pricecharting.com/game/pal-playstation/tony-hawk-4",
    );
    expect(presented.referenceCatalogLink?.isDirect).toBe(true);
  });
});

describe("presentItemFromStorage PriceCharting chip", () => {
  it("keeps the PriceCharting search catalog chip on the item detail facts", () => {
    const presented = presentItemFromStorage({
      name: "WRC 4: FIA World Rally Championship",
      barcode: "",
      shelf: { type: "games", name: "PlayStation Vita" },
      metadata: {
        id: "meta-1",
        title: "Wrc 4",
        duration: null,
        pageCount: null,
        tracksCount: null,
        description: null,
        releaseDate: null,
        imageUrl: null,
        heroImageUrl: null,
        sourceType: null,
        sourceQuery: null,
        lastFetched: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        aliases: null,
        facts: JSON.stringify([
          {
            kind: "external-link",
            source: "screenscraper",
            label: "SS",
            url: "https://www.screenscraper.fr/gameinfos.php?plateforme=62&gameid=29600",
          },
        ]),
        attachments: [],
        authors: [],
        publishers: [],
        fieldEvidence: [],
        priceOffers: [
          {
            source: "PriceCharting",
            sourceUrl: null,
            productName: null,
            rawValue: { priceUsed: 2167, priceUsedCIB: 2637, priceNew: 3410 },
          },
        ],
      },
    });
    const links = (presented.metadata?.facts || []).filter(
      (fact) => fact.kind === "external-link",
    );
    const priceCharting = links.find(
      (fact) =>
        fact.label === "PriceCharting" || fact.source === "pricecharting",
    );
    expect(priceCharting?.url).toContain("pricecharting.com");
    expect(priceCharting?.url).toContain("search-products");
  });

  it("keeps write-persisted marketplace covers on the gallery without present inject", () => {
    const bmCover =
      "https://d2e6ccujb3mkqf.cloudfront.net/d0df7a5d-d274-4cad-948c-c26b697bdd7a-1.jpg";
    const presented = presentItemFromStorage({
      name: "Sega Megadrive",
      barcode: "",
      shelf: { type: "hardware", name: "Consoles" },
      metadata: {
        id: "meta-md",
        title: "Sega Megadrive",
        duration: null,
        pageCount: null,
        tracksCount: null,
        description: null,
        releaseDate: null,
        imageUrl:
          "https://storage.googleapis.com/images.pricecharting.com/pc-md.jpg",
        heroImageUrl: null,
        sourceType: null,
        sourceQuery: null,
        lastFetched: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        aliases: null,
        facts: JSON.stringify([
          {
            kind: "external-link",
            source: "Back Market",
            label: "Back Market",
            url: "https://www.backmarket.fr/fr-fr/p/sega-mega-drive-1601-09-noir/d0df7a5d-d274-4cad-948c-c26b697bdd7a",
          },
        ]),
        attachments: [
          {
            id: "att-pc",
            type: "cover" as const,
            title: "Main Image",
            duration: null,
            url: "https://storage.googleapis.com/images.pricecharting.com/pc-md.jpg",
            metadataId: "meta-md",
            createdAt: new Date(),
            updatedAt: new Date(),
            role: null,
            source: "pricecharting",
            coverProvenance: null,
            platformKey: null,
            width: null,
            height: null,
            meanLuminance: null,
            darkPixelRatio: null,
          },
          {
            id: "att-bm",
            type: "cover" as const,
            title: "Sega Mega Drive - Noir",
            duration: null,
            url: bmCover,
            metadataId: "meta-md",
            createdAt: new Date(),
            updatedAt: new Date(),
            role: null,
            source: "backmarket",
            coverProvenance: null,
            platformKey: null,
            width: null,
            height: null,
            meanLuminance: null,
            darkPixelRatio: null,
          },
        ],
        authors: [],
        publishers: [],
        fieldEvidence: [],
      },
    });

    expect(
      presented.metadata?.attachments?.some(
        (attachment) =>
          attachment.source === "backmarket" && attachment.url === bmCover,
      ),
    ).toBe(true);
  });
});
