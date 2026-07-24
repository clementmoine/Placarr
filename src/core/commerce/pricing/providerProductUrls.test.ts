import { describe, expect, it } from "vitest";

import { providerProductUrlsFromMetadataFacts } from "@/core/catalog/catalog";
import { providerProductUrlsForKey } from "@/core/commerce/pricing/providerProductUrls";
import type { MetadataFact } from "@/types/metadataProvider";

describe("providerProductUrlsFromMetadataFacts", () => {
  it("maps external-link facts to price-capable providers by source", () => {
    const facts: MetadataFact[] = [
      {
        kind: "external-link",
        label: "Chasse aux Livres",
        value: "Voir la fiche",
        url: "https://www.chasse-aux-livres.fr/prix/B01M0YB4GP/iello-black-stories-musique-d-enfer",
        source: "chasseauxlivres",
        priority: 32,
      },
    ];

    expect(providerProductUrlsFromMetadataFacts(facts)).toEqual([
      {
        providerKey: "chasseauxlivres",
        url: "https://www.chasse-aux-livres.fr/prix/B01M0YB4GP/iello-black-stories-musique-d-enfer",
      },
    ]);
  });

  it("maps source-url facts to price-capable providers", () => {
    const facts: MetadataFact[] = [
      {
        kind: "source-url",
        label: "Chasse aux Livres",
        value: "https://www.chasse-aux-livres.fr/prix/B01/example",
        url: "https://www.chasse-aux-livres.fr/prix/B01/example",
        source: "chasseauxlivres",
      },
    ];

    expect(providerProductUrlsFromMetadataFacts(facts)).toEqual([
      {
        providerKey: "chasseauxlivres",
        url: "https://www.chasse-aux-livres.fr/prix/B01/example",
      },
    ]);
  });

  it("falls back to website host matching when fact source is missing", () => {
    const facts: MetadataFact[] = [
      {
        kind: "external-link",
        label: "Chasse aux Livres",
        value: "Voir la fiche",
        url: "https://www.chasse-aux-livres.fr/prix/B01M0YB4GP/example",
      },
    ];

    expect(providerProductUrlsFromMetadataFacts(facts)).toEqual([
      {
        providerKey: "chasseauxlivres",
        url: "https://www.chasse-aux-livres.fr/prix/B01M0YB4GP/example",
      },
    ]);
  });

  it("ignores non-price providers such as wikidata", () => {
    const facts: MetadataFact[] = [
      {
        kind: "external-link",
        label: "Wikidata",
        value: "Q123",
        url: "https://www.wikidata.org/wiki/Q123",
        source: "wikidata",
      },
    ];

    expect(providerProductUrlsFromMetadataFacts(facts)).toEqual([]);
  });

  it("dedupes repeated URLs for the same provider", () => {
    const facts: MetadataFact[] = [
      {
        kind: "external-link",
        label: "Chasse aux Livres",
        value: "Voir la fiche",
        url: "https://www.chasse-aux-livres.fr/prix/B01/example",
        source: "chasseauxlivres",
      },
      {
        kind: "external-link",
        label: "Chasse aux Livres",
        value: "Voir la fiche",
        url: "https://www.chasse-aux-livres.fr/prix/B01/example",
        source: "Chasse aux Livres",
      },
    ];

    expect(providerProductUrlsFromMetadataFacts(facts)).toHaveLength(1);
  });
});

describe("providerProductUrlsForKey", () => {
  it("returns URLs for the requested provider only", () => {
    const refs = [
      {
        providerKey: "chasseauxlivres",
        url: "https://www.chasse-aux-livres.fr/prix/B01/example",
      },
      { providerKey: "ebay", url: "https://www.ebay.fr/itm/123" },
    ];

    expect(providerProductUrlsForKey("chasseauxlivres", refs)).toEqual([
      "https://www.chasse-aux-livres.fr/prix/B01/example",
    ]);
  });
});
