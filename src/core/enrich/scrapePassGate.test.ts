import { describe, expect, it } from "vitest";

import {
  externalIdsFromStoredSources,
  metadataResultsHavePrimaryBookCover,
  preferPinnedProviderIds,
  providerRecordUrlsFromStoredSources,
  scrapeProviderIdsFromStoredSources,
  scrapeProvidersForMetadataPass,
  shouldRunScrapeMetadataPass,
} from "./scrapePassGate";
import type { MetadataResult } from "@/types/metadataProvider";
import type { Capability } from "@/types/providerRegistry";

function hasCapability(
  results: Array<MetadataResult | null | undefined>,
  capability: Capability,
): boolean {
  return results.some((result) => {
    if (!result) return false;
    if (capability === "identify") return Boolean(result.title?.trim());
    if (capability === "cover") return Boolean(result.imageUrl?.trim());
    if (capability === "description")
      return Boolean(result.description?.trim());
    return false;
  });
}

describe("shouldRunScrapeMetadataPass", () => {
  const googleBooksCover: MetadataResult = {
    title: "Wakfu",
    imageUrl: "https://books.google.com/books/content?id=x",
    description: "Synopsis",
    attachments: [
      {
        type: "cover",
        url: "https://books.google.com/books/content?id=x",
        source: "googlebooks",
      },
    ],
  };

  const bedethequeCover: MetadataResult = {
    title: "Wakfu",
    imageUrl: "https://www.bedetheque.com/media/Couvertures/Couv_123.jpg",
    description: "Synopsis",
    attachments: [
      {
        type: "cover",
        url: "https://www.bedetheque.com/media/Couvertures/Couv_123.jpg",
        source: "bedetheque",
      },
    ],
  };

  it("still runs book scrapes when only a secondary API cover exists", () => {
    expect(
      shouldRunScrapeMetadataPass({
        type: "books",
        activeResults: [googleBooksCover],
        candidateScrapeProviderIds: ["booknode", "bdovore", "bedetheque"],
        hasCapability,
      }),
    ).toBe(true);
  });

  it("skips scrapes when a primary book cover + description already exist", () => {
    expect(
      shouldRunScrapeMetadataPass({
        type: "books",
        activeResults: [bedethequeCover],
        candidateScrapeProviderIds: ["booknode", "bdovore"],
        hasCapability,
      }),
    ).toBe(false);
  });

  it("runs scrapes when cover or description is missing", () => {
    expect(
      shouldRunScrapeMetadataPass({
        type: "books",
        activeResults: [{ title: "Wakfu", description: "x" }],
        candidateScrapeProviderIds: ["booknode"],
        hasCapability,
      }),
    ).toBe(true);
  });

  it("runs scrapes when the fiche already cites a scrape provider", () => {
    expect(
      shouldRunScrapeMetadataPass({
        type: "books",
        activeResults: [bedethequeCover],
        existingScrapeProviderIds: ["bdovore"],
        candidateScrapeProviderIds: ["booknode", "bdovore"],
        hasCapability,
      }),
    ).toBe(true);
  });

  it("skips game scrapes when APIs already provide identify+cover+description", () => {
    // LaunchBox is auth.none (local index) so it is not in this scrape candidate
    // list — otherwise a full IGDB/ScreenScraper snapshot would starve it.
    expect(
      shouldRunScrapeMetadataPass({
        type: "games",
        activeResults: [
          {
            title: "Tony Hawk's American Wasteland",
            imageUrl: "https://example.com/cover.jpg",
            description: "Skateboarding open world.",
          },
        ],
        candidateScrapeProviderIds: ["howlongtobeat", "coverproject"],
        hasCapability,
      }),
    ).toBe(false);
  });
});

describe("scrapeProvidersForMetadataPass", () => {
  const completeGame: MetadataResult = {
    title: "Tony Hawk's American Wasteland",
    imageUrl: "https://example.com/cover.jpg",
    description: "Skateboarding open world.",
  };

  it("returns the full candidate set when Tier 0+1 still has gaps", () => {
    expect(
      scrapeProvidersForMetadataPass({
        type: "games",
        activeResults: [{ title: "Tony Hawk" }],
        candidateScrapeProviderIds: ["pricecharting", "howlongtobeat"],
        hasCapability,
      }),
    ).toEqual(["pricecharting", "howlongtobeat"]);
  });

  it("narrows to fiche-pinned scrapes when Tier 0+1 already complete", () => {
    expect(
      scrapeProvidersForMetadataPass({
        type: "games",
        activeResults: [completeGame],
        existingScrapeProviderIds: ["pricecharting"],
        candidateScrapeProviderIds: [
          "pricecharting",
          "howlongtobeat",
          "coverproject",
        ],
        hasCapability,
      }),
    ).toEqual(["pricecharting"]);
  });

  it("returns empty when complete and no scrape is pinned on the fiche", () => {
    expect(
      scrapeProvidersForMetadataPass({
        type: "games",
        activeResults: [completeGame],
        candidateScrapeProviderIds: ["howlongtobeat", "coverproject"],
        hasCapability,
      }),
    ).toEqual([]);
  });

  it("still seeks all book scrapes when only a secondary API cover exists", () => {
    expect(
      scrapeProvidersForMetadataPass({
        type: "books",
        activeResults: [
          {
            title: "Wakfu",
            imageUrl: "https://books.google.com/books/content?id=x",
            description: "Synopsis",
            attachments: [
              {
                type: "cover",
                url: "https://books.google.com/books/content?id=x",
                source: "googlebooks",
              },
            ],
          },
        ],
        candidateScrapeProviderIds: ["booknode", "bdovore", "bedetheque"],
        hasCapability,
      }),
    ).toEqual(["booknode", "bdovore", "bedetheque"]);
  });
});

describe("metadataResultsHavePrimaryBookCover", () => {
  it("ignores Google Books / OpenLibrary secondary covers", () => {
    expect(
      metadataResultsHavePrimaryBookCover([
        {
          title: "X",
          imageUrl: "https://books.google.com/x",
          attachments: [
            {
              type: "cover",
              url: "https://books.google.com/x",
              source: "googlebooks",
            },
          ],
        },
      ]),
    ).toBe(false);
  });

  it("accepts BDovore / Bedetheque primary covers", () => {
    expect(
      metadataResultsHavePrimaryBookCover([
        {
          title: "X",
          imageUrl: "https://www.bdovore.com/images/couv/CV-051068-050605.jpg",
          attachments: [
            {
              type: "cover",
              url: "https://www.bdovore.com/images/couv/CV-051068-050605.jpg",
              source: "bdovore",
            },
          ],
        },
      ]),
    ).toBe(true);
  });
});

describe("scrapeProviderIdsFromStoredSources", () => {
  it("keeps only registry scrape providers from mixed sources", () => {
    const ids = scrapeProviderIdsFromStoredSources({
      facts: [
        { source: "Open Library" },
        { source: "Bedetheque" },
        { source: "googlebooks" },
      ],
      fieldEvidence: [{ source: "booknode · fr" }],
      attachments: [{ source: "MergedEngine" }],
    });
    expect(ids.sort()).toEqual(["bedetheque", "booknode"].sort());
  });
});

describe("externalIdsFromStoredSources", () => {
  it("parses BDovore id_tome from stored fiche URLs", () => {
    expect(
      externalIdsFromStoredSources({
        facts: [
          {
            kind: "external-link",
            source: "bdovore",
            url: "https://www.bdovore.com/Album?id_tome=51068",
          },
        ],
      }),
    ).toEqual({ bdovore: "51068" });
  });

  it("parses Bedetheque album ids from fiche URLs", () => {
    expect(
      externalIdsFromStoredSources({
        facts: [
          {
            kind: "external-link",
            source: "bedetheque",
            url: "https://www.bedetheque.com/BD-Super-Picsou-Geant-Tome-7-Numero-7-56641.html",
          },
        ],
      }),
    ).toEqual({ bedetheque: "56641" });
  });

  it("parses BDphile numéro ids and Vivlio product ISBNs from fiche URLs", () => {
    expect(
      externalIdsFromStoredSources({
        facts: [
          {
            kind: "external-link",
            source: "bdphile",
            url: "https://www.bdphile.fr/revue/numero/308/",
          },
          {
            kind: "external-link",
            source: "vivlio",
            url: "https://shop.vivlio.com/product/9782749961347_9782749961347_3/survivantes",
          },
        ],
      }),
    ).toEqual({
      bdphile: "308",
      vivlio: "9782749961347",
    });
  });
});

describe("providerRecordUrlsFromStoredSources", () => {
  it("keeps absolute fiche URLs keyed by provider id", () => {
    expect(
      providerRecordUrlsFromStoredSources({
        facts: [
          {
            kind: "external-link",
            source: "bedetheque",
            url: "https://www.bedetheque.com/BD-Super-Picsou-Geant-Tome-7-Numero-7-56641.html",
          },
          {
            kind: "external-link",
            source: "bdovore",
            url: "https://www.bdovore.com/Album?id_tome=51068",
          },
        ],
      }),
    ).toEqual({
      bedetheque:
        "https://www.bedetheque.com/BD-Super-Picsou-Geant-Tome-7-Numero-7-56641.html",
      bdovore: "https://www.bdovore.com/Album?id_tome=51068",
    });
  });
});

describe("preferPinnedProviderIds", () => {
  it("moves memorized fiche pins ahead of blind seekers", () => {
    expect(
      preferPinnedProviderIds(
        ["bedetheque", "bdovore", "bdphile", "booknode"],
        ["bdovore", "bdphile"],
      ),
    ).toEqual(["bdovore", "bdphile", "bedetheque", "booknode"]);
  });

  it("keeps original relative order within pin and seek groups", () => {
    expect(
      preferPinnedProviderIds(
        ["a", "b", "c", "d"],
        ["c", "a"],
      ),
    ).toEqual(["a", "c", "b", "d"]);
  });
});
