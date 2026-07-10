import { describe, expect, it } from "vitest";

import {
  appendMissingProviderExternalLinkFacts,
  buildProfileProviderLinkFacts,
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
  it("aggregates contributors from facts, evidence, offers, and catalog link", () => {
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
      ],
      fieldEvidence: [
        {
          field: "external-link:NetGamesRetro",
          value: "LittleBigPlanet",
          source: "netgamesretro",
          sourceUrl: "https://www.netgamesretro.com/jeu/little-big-planet",
        },
      ],
      attachments: [{ source: "steamgriddb" }, { source: "rawg" }],
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
      "RAWG",
      "SteamGridDB",
    ]);
  });
});
