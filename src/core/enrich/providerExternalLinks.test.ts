import { describe, expect, it } from "vitest";

import {
  appendMissingProviderExternalLinkFacts,
  buildProfileProviderLinkFacts,
  coverAttachmentsFromPriceOffers,
  dedupeProviderExternalLinkFacts,
  externalLinkFactsFromFieldEvidence,
  externalLinkFactsFromPriceOffers,
  looksLikeProviderProductPageUrl,
  mirrorSourceUrlFactsAsExternalLinks,
  pickBestProviderDocumentUrl,
  purgeContradictedProviderExternalLinks,
  reconcileExternalLinksFromPriceOffers,
} from "@/core/enrich/providerExternalLinks";
import { makeObservationUsage } from "@/core/enrich/observations";
import type { MetadataFact } from "@/types/metadataProvider";

describe("looksLikeProviderProductPageUrl", () => {
  it("accepts product pages and rejects CDN assets", () => {
    expect(
      looksLikeProviderProductPageUrl(
        "https://www.philibertnet.com/fr/black-stories.html",
      ),
    ).toBe(true);
    expect(
      looksLikeProviderProductPageUrl(
        "https://cdn.example.com/covers/black-stories.jpg",
      ),
    ).toBe(false);
  });

  it("rejects known non-product provider asset paths", () => {
    expect(
      looksLikeProviderProductPageUrl(
        "https://neoclone.screenscraper.fr/api2/mediaJeu.php?id=1",
      ),
    ).toBe(false);
    expect(
      looksLikeProviderProductPageUrl(
        "https://cdn1.booknode.com/book_cover/1/full.jpg",
      ),
    ).toBe(false);
  });

  it("rejects site roots (homepage is not a product fiche)", () => {
    expect(
      looksLikeProviderProductPageUrl("https://www.netgamesretro.com/"),
    ).toBe(false);
    expect(
      looksLikeProviderProductPageUrl("https://www.netgamesretro.com"),
    ).toBe(false);
  });
});

describe("pickBestProviderDocumentUrl", () => {
  it("prefers catalog_product observation URLs over generic provenance", () => {
    const url = pickBestProviderDocumentUrl({
      observations: [
        {
          kind: "title",
          role: "listing_title",
          value: "Black Stories occasion",
          provenance: {
            providerId: "okkazeo",
            sourceUrl: "https://www.okkazeo.com/annonce/999.html",
            sourceDocumentRole: "marketplace_listing",
            evidenceSignals: [],
          },
          usage: makeObservationUsage(),
        },
        {
          kind: "title",
          role: "catalog_title",
          value: "Black Stories",
          provenance: {
            providerId: "okkazeo",
            sourceUrl: "https://www.okkazeo.com/jeu/black-stories/123.html",
            sourceDocumentRole: "catalog_product",
            evidenceSignals: [],
          },
          usage: makeObservationUsage(),
        },
      ],
    });

    expect(url).toBe("https://www.okkazeo.com/jeu/black-stories/123.html");
  });

  it("uses offer observation URLs when no catalog page exists", () => {
    const url = pickBestProviderDocumentUrl({
      observations: [
        {
          kind: "offer",
          role: "marketplace_offer",
          url: "https://www.example-retailer.com/product/black-stories.html",
          provenance: {
            providerId: "example",
            sourceDocumentRole: "offer",
            evidenceSignals: [],
          },
          usage: makeObservationUsage(),
        },
      ],
    });

    expect(url).toBe(
      "https://www.example-retailer.com/product/black-stories.html",
    );
  });
});

describe("mirrorSourceUrlFactsAsExternalLinks", () => {
  it("creates an external-link from a source-url fact", () => {
    const facts: MetadataFact[] = [
      {
        kind: "source-url",
        label: "Philibert",
        value: "https://www.philibertnet.com/fr/black-stories.html",
        url: "https://www.philibertnet.com/fr/black-stories.html",
        source: "philibert",
      },
    ];

    const mirrored = mirrorSourceUrlFactsAsExternalLinks(facts);
    expect(mirrored).toHaveLength(1);
    expect(mirrored[0]?.kind).toBe("external-link");
    expect(mirrored[0]?.url).toBe(
      "https://www.philibertnet.com/fr/black-stories.html",
    );
  });
});

describe("dedupeProviderExternalLinkFacts", () => {
  it("collapses provider aliases such as bgg and boardgamegeek", () => {
    const merged = dedupeProviderExternalLinkFacts([
      {
        kind: "external-link",
        label: "BoardGameGeek",
        value: "Fiche BGG",
        url: "https://boardgamegeek.com/boardgame/18803",
        source: "boardgamegeek",
        priority: 303,
      },
      {
        kind: "external-link",
        label: "BoardGameGeek",
        value: "Voir la fiche",
        url: "https://boardgamegeek.com/boardgame/18803",
        source: "bgg",
        priority: 42,
      },
      {
        kind: "players",
        label: "Joueurs",
        value: "2-99",
        source: "bgg",
      },
    ]);

    expect(merged.filter((fact) => fact.kind === "external-link")).toHaveLength(
      1,
    );
    expect(merged.find((fact) => fact.kind === "external-link")?.priority).toBe(
      303,
    );
    expect(merged.some((fact) => fact.kind === "players")).toBe(true);
  });
});

describe("appendMissingProviderExternalLinkFacts", () => {
  it("adds one external-link per provider from observations", () => {
    const merged = appendMissingProviderExternalLinkFacts(
      [],
      [
        {
          providerId: "philibert",
          metadata: {
            observations: [
              {
                kind: "title",
                role: "catalog_title",
                value: "Black Stories",
                provenance: {
                  providerId: "philibert",
                  sourceUrl:
                    "https://www.philibertnet.com/fr/black-stories.html",
                  sourceDocumentRole: "catalog_product",
                  evidenceSignals: [],
                },
                usage: makeObservationUsage(),
              },
            ],
          },
        },
      ],
    );

    expect(
      merged.some(
        (fact) =>
          fact.kind === "external-link" &&
          fact.source === "philibert" &&
          fact.url === "https://www.philibertnet.com/fr/black-stories.html",
      ),
    ).toBe(true);
  });

  it("does not emit external-links for internal merge keys like __cached_fiche__", () => {
    const merged = appendMissingProviderExternalLinkFacts(
      [],
      [
        {
          providerId: "__cached_fiche__",
          metadata: {
            facts: [
              {
                kind: "external-link",
                label: "PriceCharting",
                value: "Voir la fiche",
                url: "https://www.pricecharting.com/game/wii/white-nintendo-wii-system",
                source: "pricecharting",
              },
            ],
          },
        },
      ],
    );

    expect(
      merged.some(
        (fact) =>
          fact.kind === "external-link" && fact.source === "__cached_fiche__",
      ),
    ).toBe(false);
  });

  it("strips already-persisted __cached_fiche__ external-links on dedupe", () => {
    const merged = dedupeProviderExternalLinkFacts([
      {
        kind: "external-link",
        label: "__cached_fiche__",
        value: "Voir la fiche",
        url: "https://www.pricecharting.com/game/wii/white-nintendo-wii-system",
        source: "__cached_fiche__",
      },
      {
        kind: "external-link",
        label: "PriceCharting",
        value: "Voir la fiche",
        url: "https://www.pricecharting.com/game/wii/white-nintendo-wii-system",
        source: "pricecharting",
      },
    ]);

    expect(merged.filter((fact) => fact.kind === "external-link")).toHaveLength(
      1,
    );
    expect(merged.find((fact) => fact.kind === "external-link")?.source).toBe(
      "pricecharting",
    );
  });

  it("does not duplicate an existing external-link for the same provider", () => {
    const existing: MetadataFact[] = [
      {
        kind: "external-link",
        label: "Philibert",
        value: "Voir la fiche",
        url: "https://www.philibertnet.com/fr/black-stories.html",
        source: "philibert",
      },
    ];

    const merged = appendMissingProviderExternalLinkFacts(existing, [
      {
        providerId: "philibert",
        metadata: {
          observations: [
            {
              kind: "title",
              role: "catalog_title",
              value: "Black Stories",
              provenance: {
                providerId: "philibert",
                sourceUrl: "https://www.philibertnet.com/fr/other-page.html",
                sourceDocumentRole: "catalog_product",
                evidenceSignals: [],
              },
              usage: makeObservationUsage(),
            },
          ],
        },
      },
    ]);

    expect(
      merged.filter(
        (fact) => fact.kind === "external-link" && fact.source === "philibert",
      ),
    ).toHaveLength(1);
  });

  it("treats PriceCharting (EUR/US) chips as covering the pricecharting provider", () => {
    const existing: MetadataFact[] = [
      {
        kind: "external-link",
        label: "PriceCharting (EUR)",
        value: "Voir la fiche",
        url: "https://www.pricecharting.com/game/pal-gamecube/black-gamecube-system",
        source: "pricecharting",
      },
      {
        kind: "external-link",
        label: "PriceCharting (US)",
        value: "Voir la fiche",
        url: "https://www.pricecharting.com/game/gamecube/black-gamecube-system",
        source: "pricecharting",
      },
    ];

    const merged = appendMissingProviderExternalLinkFacts(existing, [
      {
        providerId: "pricecharting",
        metadata: {
          observations: [
            {
              kind: "title",
              role: "catalog_title",
              value: "Black Gamecube System",
              provenance: {
                providerId: "pricecharting",
                sourceUrl:
                  "https://www.pricecharting.com/game/pal-gamecube/black-gamecube-system",
                sourceDocumentRole: "catalog_product",
                evidenceSignals: [],
              },
              usage: makeObservationUsage(),
            },
          ],
        },
      },
    ]);

    expect(
      merged.filter(
        (fact) =>
          fact.kind === "external-link" && fact.source === "pricecharting",
      ),
    ).toHaveLength(2);
    expect(
      merged.some(
        (fact) =>
          fact.kind === "external-link" && fact.label === "PriceCharting",
      ),
    ).toBe(false);
  });
});

describe("coverAttachmentsFromPriceOffers", () => {
  const bmCover =
    "https://d2e6ccujb3mkqf.cloudfront.net/d0df7a5d-d274-4cad-948c-c26b697bdd7a-1_4ec5a216-179e-4976-9899-9b3362c94cbc.jpg";

  it("surfaces Back Market listing covers when metadata gallery has none", () => {
    const covers = coverAttachmentsFromPriceOffers(
      [
        {
          source: "Back Market",
          sourceUrl:
            "https://www.backmarket.fr/fr-fr/p/sega-mega-drive-1601-09-noir/d0df7a5d-d274-4cad-948c-c26b697bdd7a",
          rawValue: {
            productName: "Sega Mega Drive - Noir",
            coverUrl: bmCover,
            sourceUrl:
              "https://www.backmarket.fr/fr-fr/p/sega-mega-drive-1601-09-noir/d0df7a5d-d274-4cad-948c-c26b697bdd7a",
          },
        },
      ],
      {
        itemTitle: "Sega Megadrive",
        shelfType: "hardware",
        existingAttachments: [
          {
            type: "cover",
            source: "pricecharting",
            url: "https://storage.googleapis.com/images.pricecharting.com/example",
          },
        ],
      },
    );

    expect(covers).toHaveLength(1);
    expect(covers[0]).toMatchObject({
      type: "cover",
      source: "backmarket",
      url: bmCover,
      title: "Sega Mega Drive - Noir",
      retailCatalogImageTitlesSource: true,
    });
  });

  it("skips when the provider already contributed a gallery cover", () => {
    expect(
      coverAttachmentsFromPriceOffers(
        [
          {
            source: "Back Market",
            rawValue: {
              productName: "Sega Mega Drive - Noir",
              coverUrl: bmCover,
            },
          },
        ],
        {
          itemTitle: "Sega Megadrive",
          shelfType: "hardware",
          existingAttachments: [
            {
              type: "cover",
              source: "backmarket",
              url: "https://d2e6ccujb3mkqf.cloudfront.net/already.jpg",
            },
          ],
        },
      ),
    ).toEqual([]);
  });

  it("skips misaligned listing titles (wrong product coverUrl)", () => {
    expect(
      coverAttachmentsFromPriceOffers(
        [
          {
            source: "Back Market",
            rawValue: {
              productName: "Sega P-47 II",
              coverUrl: bmCover,
            },
          },
        ],
        {
          itemTitle: "Sega Megadrive",
          shelfType: "hardware",
        },
      ),
    ).toEqual([]);
  });
});

describe("externalLinkFactsFromPriceOffers", () => {
  it("mirrors price offer sourceUrl into external-link facts", () => {
    const facts = externalLinkFactsFromPriceOffers([
      {
        source: "chasseauxlivres",
        sourceUrl:
          "https://www.chasse-aux-livres.fr/prix/B01/example-black-stories",
      },
    ]);

    expect(facts).toHaveLength(1);
    expect(facts[0]?.kind).toBe("external-link");
    expect(facts[0]?.source).toBe("chasseauxlivres");
  });

  it("falls back to rawValue.productUrl when sourceUrl is missing", () => {
    const facts = externalLinkFactsFromPriceOffers(
      [
        {
          source: "ChasseAuxLivres",
          sourceUrl: null,
          rawValue: {
            productUrl:
              "https://www.chasse-aux-livres.fr/prix/B001K9E2SQ/iello-black-stories",
          },
        },
      ],
      [],
      { itemBarcode: "0827912079678", itemTitle: "Black Stories" },
    );

    expect(facts).toHaveLength(1);
    expect(facts[0]?.url).toContain("B001K9E2SQ");
  });

  it("rejects a price offer whose product title denotes another edition", () => {
    const facts = externalLinkFactsFromPriceOffers(
      [
        {
          source: "LeDenicheur",
          sourceUrl: "https://ledenicheur.fr/product.php?p=4955683",
          rawValue: {
            productName: "Black Stories: Funny Death Edition 2",
          },
        },
      ],
      [],
      {
        itemBarcode: "0721450083770",
        itemTitle: "Black Stories - Femmes Fatales",
      },
    );

    expect(facts).toHaveLength(0);
  });

  it("dedupes against existing external-link facts for the same provider", () => {
    const facts = externalLinkFactsFromPriceOffers(
      [
        {
          source: "okkazeo",
          sourceUrl: "https://www.okkazeo.com/jeu/black-stories/123.html",
        },
      ],
      [
        {
          kind: "external-link",
          label: "Okkazeo",
          value: "Voir la fiche",
          url: "https://www.okkazeo.com/jeu/black-stories/123.html",
          source: "okkazeo",
        },
      ],
    );

    expect(facts).toHaveLength(0);
  });

  it("replaces a contradicted retailer link when a barcode-confirmed URL arrives", () => {
    const facts = externalLinkFactsFromPriceOffers(
      [
        {
          source: "ledenicheur",
          sourceUrl:
            "https://ledenicheur.fr/product.php?p=9999-black-stories-827912079678",
          rawValue: { productGtin: "0827912079678" },
        },
      ],
      [
        {
          kind: "external-link",
          label: "LeDénicheur",
          value: "Voir la fiche",
          url: "https://ledenicheur.fr/product.php?p=4955683",
          source: "ledenicheur",
        },
      ],
      { itemBarcode: "0827912079678" },
    );

    expect(facts).toHaveLength(1);
    expect(facts[0]?.url).toContain("827912079678");
  });
});

describe("purgeContradictedProviderExternalLinks", () => {
  it("keeps name-database catalog links when slug ids would false-positive", () => {
    const facts: MetadataFact[] = [
      {
        kind: "external-link",
        label: "Booknode",
        value: "Voir la fiche",
        url: "https://booknode.com/super_picsou_geant_n_1_0379552",
        source: "booknode",
      },
      {
        kind: "external-link",
        label: "Bédéthèque",
        value: "Voir la fiche",
        url: "https://www.bedetheque.com/BD-Super-Picsou-Geant-Tome-1-Numero-1-478946.html",
        source: "bedetheque",
      },
    ];

    const kept = purgeContradictedProviderExternalLinks(
      facts,
      "",
      "Super Picsou Géant n°01",
    );

    expect(kept.map((fact) => fact.source)).toEqual(["booknode", "bedetheque"]);
  });

  it("still purges retailer slug contradictions", () => {
    const kept = purgeContradictedProviderExternalLinks(
      [
        {
          kind: "external-link",
          label: "Chasse aux Livres",
          value: "Voir la fiche",
          url: "https://www.chasse-aux-livres.fr/prix/B071ZXH7MV/black-stories-fantastique",
          source: "chasseauxlivres",
        },
      ],
      "",
      "Black Stories",
    );

    expect(kept).toHaveLength(0);
  });

  it("keeps PriceCharting PSOne Slim System links for a bare PSOne shelf title", () => {
    const kept = purgeContradictedProviderExternalLinks(
      [
        {
          kind: "external-link",
          label: "PriceCharting (EUR)",
          value: "Voir la fiche",
          url: "https://www.pricecharting.com/game/pal-playstation/psone-slim-system",
          source: "pricecharting",
        },
      ],
      "",
      "PSOne",
      "hardware",
    );

    expect(kept).toHaveLength(1);
  });

  it("keeps verified PriceCharting /game/ links when hardware residual mismatches edition wording", () => {
    // Shelf title says “Legend of Zelda”; PC slug says Tears of the Kingdom.
    // Residual is uncertain → retailer heuristics would purge; verified fiches must stay.
    const kept = purgeContradictedProviderExternalLinks(
      [
        {
          kind: "external-link",
          label: "PriceCharting (EUR)",
          value: "Voir la fiche",
          url: "https://www.pricecharting.com/game/pal-nintendo-switch/nintendo-switch-oled-zelda-tears-of-the-kingdom-edition",
          source: "pricecharting",
        },
        {
          kind: "external-link",
          label: "PriceCharting (US)",
          value: "Voir la fiche",
          url: "https://www.pricecharting.com/game/nintendo-switch/nintendo-switch-oled-zelda-tears-of-the-kingdom-edition",
          source: "pricecharting",
        },
      ],
      "045496453572",
      "Nintendo Switch OLED Édition The Legend of Zelda",
      "hardware",
    );

    expect(kept.map((fact) => fact.label)).toEqual([
      "PriceCharting (EUR)",
      "PriceCharting (US)",
    ]);
  });

  it("purges verified PriceCharting /game/ links after a finish/color rename", () => {
    const kept = purgeContradictedProviderExternalLinks(
      [
        {
          kind: "external-link",
          label: "PriceCharting",
          value: "Voir la fiche",
          url: "https://www.pricecharting.com/game/pal-nintendo-3ds/new-nintendo-3ds-xl-pink-+-white",
          source: "pricecharting",
        },
      ],
      "",
      "New Nintendo 3DS XL Metallic Blue",
      "hardware",
    );

    expect(kept).toHaveLength(0);
  });

  it("purges marketplace Back Market PS One pins on PS5 / Classic shelves", () => {
    const psOneUrl =
      "https://www.backmarket.fr/fr-fr/p/ps-one/8c13cfb2-adef-482c-87bb-8b2384c5fa72?l=11";
    const fact: MetadataFact = {
      kind: "external-link",
      label: "Back Market",
      value: "Voir la fiche",
      url: psOneUrl,
      source: "backmarket",
    };

    expect(
      purgeContradictedProviderExternalLinks(
        [fact],
        "",
        "PlayStation 5",
        "hardware",
      ),
    ).toHaveLength(0);
    expect(
      purgeContradictedProviderExternalLinks(
        [fact],
        "",
        "PlayStation Classic Console",
        "hardware",
      ),
    ).toHaveLength(0);
  });

  it("keeps PriceCharting search catalog chips (path is not a product slug)", () => {
    const kept = purgeContradictedProviderExternalLinks(
      [
        {
          kind: "external-link",
          label: "PriceCharting",
          value: "Voir la fiche",
          url: "https://www.pricecharting.com/fr/search-products?type=videogames&q=Wrc%204",
          source: "pricecharting",
        },
      ],
      "",
      "WRC 4: FIA World Rally Championship",
    );

    expect(kept).toHaveLength(1);
    expect(kept[0]?.source).toBe("pricecharting");
  });
});

describe("reconcileExternalLinksFromPriceOffers", () => {
  it("does not purge trusted catalog links added before price reconciliation", () => {
    const facts: MetadataFact[] = [
      {
        kind: "external-link",
        label: "eBay",
        value: "Voir la fiche",
        url: "https://www.ebay.fr/itm/298306332354",
        source: "eBay",
      },
      {
        kind: "external-link",
        label: "Booknode",
        value: "Voir la fiche",
        url: "https://booknode.com/super_picsou_geant_n_1_0379552",
        source: "booknode",
      },
      {
        kind: "external-link",
        label: "Bédéthèque",
        value: "Voir la fiche",
        url: "https://www.bedetheque.com/BD-Super-Picsou-Geant-Tome-1-Numero-1-478946.html",
        source: "bedetheque",
      },
    ];

    const reconciled = reconcileExternalLinksFromPriceOffers(
      facts,
      [
        {
          source: "eBay",
          sourceUrl: "https://www.ebay.fr/itm/298306332354",
        },
      ],
      "",
      "Super Picsou Géant n°01",
    );

    expect(reconciled.map((fact) => fact.source).sort()).toEqual([
      "bedetheque",
      "booknode",
      "eBay",
    ]);
  });

  it("does not collapse PriceCharting EUR/US chips into a generic link", () => {
    const facts: MetadataFact[] = [
      {
        kind: "external-link",
        label: "PriceCharting (EUR)",
        value: "Voir la fiche",
        url: "https://www.pricecharting.com/game/pal-gamecube/black-gamecube-system",
        source: "pricecharting",
      },
      {
        kind: "external-link",
        label: "PriceCharting (US)",
        value: "Voir la fiche",
        url: "https://www.pricecharting.com/game/gamecube/black-gamecube-system",
        source: "pricecharting",
      },
    ];

    const reconciled = reconcileExternalLinksFromPriceOffers(
      facts,
      [
        {
          source: "PriceCharting",
          sourceUrl:
            "https://www.pricecharting.com/game/pal-gamecube/black-gamecube-system",
        },
      ],
      "0045496370039",
      "Nintendo GameCube Black",
      "hardware",
    );

    expect(
      reconciled
        .filter((fact) => fact.kind === "external-link")
        .map((fact) => ({
          label: fact.label,
          url: fact.url,
        })),
    ).toEqual([
      {
        label: "PriceCharting (EUR)",
        url: "https://www.pricecharting.com/game/pal-gamecube/black-gamecube-system",
      },
      {
        label: "PriceCharting (US)",
        url: "https://www.pricecharting.com/game/gamecube/black-gamecube-system",
      },
    ]);
  });

  it("rejects a GT3 pack PriceCharting offer for bare PlayStation 2", () => {
    const facts: MetadataFact[] = [
      {
        kind: "external-link",
        label: "PriceCharting (EUR)",
        value: "Voir la fiche",
        url: "https://www.pricecharting.com/game/pal-playstation-2/playstation-2-system",
        source: "pricecharting",
      },
      {
        kind: "external-link",
        label: "PriceCharting (US)",
        value: "Voir la fiche",
        url: "https://www.pricecharting.com/game/playstation-2/playstation-2-system",
        source: "pricecharting",
      },
    ];

    const reconciled = reconcileExternalLinksFromPriceOffers(
      facts,
      [
        {
          source: "PriceCharting",
          sourceUrl:
            "https://www.pricecharting.com/game/playstation-2/sony-playstation-2-gt3-racing-pack",
          rawValue: { productName: "Sony Playstation 2 GT3 Racing Pack" },
        },
      ],
      null,
      "PlayStation 2",
      "hardware",
    );

    expect(
      reconciled
        .filter((fact) => fact.kind === "external-link")
        .map((fact) => fact.label),
    ).toEqual(["PriceCharting (EUR)", "PriceCharting (US)"]);
  });

  it("accepts a Back Market listing that only matches a soft alias", () => {
    const reconciled = reconcileExternalLinksFromPriceOffers(
      [],
      [
        {
          source: "Back Market",
          sourceUrl:
            "https://www.backmarket.fr/fr-fr/p/sony-playstation-3-slim-cech-2004a/abc123",
          productName: "CECH-2004A",
        },
      ],
      "711719801564",
      "PlayStation 3 Slim Gris",
      "hardware",
      ["PlayStation 3 Slim Gris", "PlayStation 3 Slim Silver", "CECH-2004A"],
    );

    expect(reconciled.find((fact) => fact.source === "Back Market")?.url).toBe(
      "https://www.backmarket.fr/fr-fr/p/sony-playstation-3-slim-cech-2004a/abc123",
    );
  });

  it("rejects the same listing when the alias bag is omitted", () => {
    const reconciled = reconcileExternalLinksFromPriceOffers(
      [],
      [
        {
          source: "Back Market",
          sourceUrl:
            "https://www.backmarket.fr/fr-fr/p/sony-playstation-3-slim-cech-2004a/abc123",
          productName: "CECH-2004A",
        },
      ],
      "711719801564",
      "PlayStation 3 Slim Gris",
      "hardware",
    );

    expect(reconciled.filter((fact) => fact.source === "Back Market")).toEqual(
      [],
    );
  });

  it("keeps PriceCharting Silver URL for a Gris shelf via finish synonyms", () => {
    const facts: MetadataFact[] = [
      {
        kind: "external-link",
        label: "PriceCharting",
        value: "Voir la fiche",
        url: "https://www.pricecharting.com/game/pal-playstation-3/sony-playstation-3-slim-silver-console",
        source: "pricecharting",
      },
    ];

    const kept = purgeContradictedProviderExternalLinks(
      facts,
      "711719801564",
      "PlayStation 3 Slim Gris",
      "hardware",
      ["PlayStation 3 Slim Gris", "PlayStation 3 Slim Silver"],
    );

    expect(kept).toHaveLength(1);
    expect(kept[0]?.url).toContain("slim-silver");
  });
});

describe("externalLinkFactsFromFieldEvidence", () => {
  it("creates external-link facts from field evidence sourceUrl", () => {
    const facts = externalLinkFactsFromFieldEvidence([
      {
        field: "title",
        value: "Black Stories",
        source: "philibert",
        sourceUrl: "https://www.philibertnet.com/fr/black-stories.html",
        confidence: 0.8,
        priority: 50,
      },
    ]);

    expect(facts).toHaveLength(1);
    expect(facts[0]?.url).toBe(
      "https://www.philibertnet.com/fr/black-stories.html",
    );
  });

  it("uses external-link field suffix as a distinct owner label", () => {
    const facts = externalLinkFactsFromFieldEvidence(
      [
        {
          field: "external-link:Wikipedia",
          value: "LittleBigPlanet",
          source: "wikidata",
          sourceUrl: "https://en.wikipedia.org/wiki/LittleBigPlanet",
        },
        {
          field: "external-link:Wikidata",
          value: "Q123",
          source: "wikidata",
          sourceUrl: "https://www.wikidata.org/wiki/Q123",
        },
      ],
      [
        {
          kind: "external-link",
          label: "Wikidata",
          value: "Voir la fiche",
          url: "https://www.wikidata.org/wiki/Q123",
          source: "wikidata",
        },
      ],
    );

    expect(facts).toHaveLength(1);
    expect(facts[0]?.label).toBe("Wikipedia");
  });
});

describe("buildProfileProviderLinkFacts", () => {
  it("keeps real product URLs and skips cover-only homepage fallbacks", () => {
    const links = buildProfileProviderLinkFacts({
      facts: [
        {
          kind: "external-link",
          label: "HowLongToBeat",
          value: "Voir la fiche",
          url: "https://howlongtobeat.com/game/123",
          source: "howlongtobeat",
        },
        {
          kind: "players",
          label: "Joueurs",
          value: "1",
          source: "rawg",
        },
        {
          kind: "price",
          label: "Prix NetGamesRetro",
          value: "20,00 €",
          source: "netgamesretro",
        },
      ],
      fieldEvidence: [
        {
          field: "external-link:NetGamesRetro",
          value: "LittleBigPlanet",
          source: "netgamesretro",
          sourceUrl: "https://www.netgamesretro.com/jeu/little-big-planet",
        },
        {
          field: "cover",
          value: "/uploads/ngr.jpg",
          source: "netgamesretro",
          sourceUrl: "/uploads/ngr.jpg",
        },
      ],
      attachments: [
        { source: "steamgriddb" },
        { source: "rawg" },
        { source: "netgamesretro" },
      ],
      priceOffers: [
        {
          source: "pricecharting",
          sourceUrl:
            "https://www.pricecharting.com/game/pal-playstation-vita/littlebigplanet",
        },
      ],
      catalogLink: {
        url: "https://www.pricecharting.com/game/pal-playstation-vita/littlebigplanet",
        providerLabel: "PriceCharting",
      },
      itemBarcode: "1234567890123",
      itemTitle: "LittleBigPlanet",
    });

    expect(links.map((fact) => fact.label).sort()).toEqual([
      "HowLongToBeat",
      "NetGamesRetro",
      "PriceCharting",
    ]);
    expect(links.find((fact) => fact.source === "netgamesretro")?.url).toBe(
      "https://www.netgamesretro.com/jeu/little-big-planet",
    );
  });

  it("does not invent a NetGamesRetro homepage chip from cover/price only", () => {
    const links = buildProfileProviderLinkFacts({
      facts: [
        {
          kind: "price",
          label: "Prix NetGamesRetro",
          value: "20,00 €",
          source: "netgamesretro",
        },
      ],
      attachments: [{ source: "netgamesretro" }],
      fieldEvidence: [
        {
          field: "cover",
          value: "/uploads/ds-gris.jpg",
          source: "netgamesretro",
          sourceUrl: "/uploads/ds-gris.jpg",
        },
      ],
      itemTitle: "Nintendo DS Gris",
      shelfType: "hardware",
    });

    expect(links.filter((fact) => fact.source === "netgamesretro")).toEqual([]);
  });
});
