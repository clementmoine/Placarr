import { describe, expect, it } from "vitest";

import {
  appendMissingProviderExternalLinkFacts,
  dedupeProviderExternalLinkFacts,
  externalLinkFactsFromFieldEvidence,
  externalLinkFactsFromPriceOffers,
  looksLikeProviderProductPageUrl,
  mirrorSourceUrlFactsAsExternalLinks,
  pickBestProviderDocumentUrl,
} from "@/core/metadata/providerExternalLinks";
import { makeObservationUsage } from "@/core/metadata/observations";
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
});
