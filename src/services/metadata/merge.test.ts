import { describe, expect, it } from "vitest";

import {
  makeObservationUsage,
  METADATA_OBSERVATION_SCHEMA_VERSION,
} from "@/lib/metadata/observations";
import {
  mergeMetadata,
  preferRequestedDisplayTitle,
} from "@/services/metadata/merge";
import type { MetadataResult } from "@/types/metadataProvider";
import type { MetadataObservation } from "@/types/metadataObservation";

describe("preferRequestedDisplayTitle", () => {
  it("prefers a clean requested Latin title over a CJK-prefixed metadata title", () => {
    const metadata: MetadataResult = {
      title: "下村陽子 - KINGDOM HEARTS Orchestra -World of Tres-",
    };
    const requested = "KINGDOM HEARTS: ORCHESTRA - World Of Tres";
    const result = preferRequestedDisplayTitle(metadata, requested);
    expect(result.title).toBe("KINGDOM HEARTS: ORCHESTRA - World Of Tres");
  });

  it("prefers the requested title when quality scores are tied", () => {
    const metadata: MetadataResult = {
      title: "Yoko Shimomura - Kingdom Hearts Orchestra  -World Of Tres- Album",
    };
    const requested = "KINGDOM HEARTS: ORCHESTRA - World Of Tres";
    const result = preferRequestedDisplayTitle(metadata, requested);
    expect(result.title).toBe("KINGDOM HEARTS: ORCHESTRA - World Of Tres");
  });

  it("prefers a more specific requested title over a shorter provider title", () => {
    const metadata: MetadataResult = {
      title: "Super Mario Bros.",
    };
    const requested = "New Super Mario Bros. Wii";
    const result = preferRequestedDisplayTitle(metadata, requested);
    expect(result.title).toBe("New Super Mario Bros. Wii");
  });

  it("rejects a mismatched provider title in favor of the requested catalog name", () => {
    const metadata: MetadataResult = {
      title: "Super Blue Boy Planet",
      aliases: ["Super Blue Boy Planet.exe"],
    };
    const requested = "Game Boy Player";
    const result = preferRequestedDisplayTitle(metadata, requested);
    expect(result.title).toBe("Game Boy Player");
    expect(result.aliases).toContain("Super Blue Boy Planet");
  });
});

describe("mergeMetadata generic function", () => {
  it("prefers trusted display observations over noisy regional fallback titles", () => {
    const noisyListingObservation = {
      kind: "title",
      role: "listing_title",
      value: "Mille Sabords - Complet Boite Notice",
      region: "fr",
      provenance: {
        providerId: "screenscraper",
        sourceDocumentRole: "marketplace_listing",
        evidenceSignals: ["same_provider_listing"],
      },
      usage: makeObservationUsage({
        displayCandidate: false,
        searchAlias: "weak",
        evidence: "weak",
      }),
    } satisfies MetadataObservation;

    const catalogObservation = {
      kind: "title",
      role: "catalog_title",
      value: "Mille Sabords",
      language: "fr",
      provenance: {
        providerId: "okkazeo",
        sourceDocumentRole: "catalog_product",
        evidenceSignals: ["structured_data", "barcode_match"],
      },
      usage: makeObservationUsage({
        displayCandidate: true,
        searchAlias: "strong",
        evidence: "strong",
      }),
    } satisfies MetadataObservation;

    const merged = mergeMetadata("boardgames", [
      {
        providerId: "screenscraper",
        metadata: {
          title: "Mille Sabords - Complet Boite Notice",
          regionalTitles: [
            { region: "fr", text: "Mille Sabords - Complet Boite Notice" },
          ],
          observations: [noisyListingObservation],
          observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
        },
      },
      {
        providerId: "okkazeo",
        metadata: {
          title: "Mille Sabords",
          regionalTitles: [{ region: "wor", text: "Mille Sabords" }],
          observations: [catalogObservation],
          observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
        },
      },
    ]);

    expect(merged.title).toBe("Mille Sabords");
  });

  it("uses medoid-like consensus inside the best title tier", () => {
    const catalogUsage = makeObservationUsage({
      displayCandidate: true,
      searchAlias: "strong",
      evidence: "strong",
    });

    const merged = mergeMetadata("boardgames", [
      {
        providerId: "screenscraper",
        metadata: {
          title: "Les Aventuriers du Rail",
          observations: [
            {
              kind: "title",
              role: "catalog_title",
              value: "Les Aventuriers du Rail",
              language: "fr",
              provenance: {
                providerId: "screenscraper",
                sourceDocumentRole: "catalog_product",
                evidenceSignals: ["structured_data"],
              },
              usage: catalogUsage,
            } satisfies MetadataObservation,
          ],
          observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
        },
      },
      {
        providerId: "okkazeo",
        metadata: {
          title: "Les Aventuriers du Rail",
          observations: [
            {
              kind: "title",
              role: "catalog_title",
              value: "Les Aventuriers du Rail",
              language: "fr",
              provenance: {
                providerId: "okkazeo",
                sourceDocumentRole: "catalog_product",
                evidenceSignals: ["structured_data"],
              },
              usage: catalogUsage,
            } satisfies MetadataObservation,
          ],
          observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
        },
      },
      {
        providerId: "philibert",
        metadata: {
          title: "Les Aventuriers du Rail - Complet Boite Notice",
          observations: [
            {
              kind: "title",
              role: "catalog_title",
              value: "Les Aventuriers du Rail - Complet Boite Notice",
              language: "fr",
              provenance: {
                providerId: "philibert",
                sourceDocumentRole: "catalog_product",
                evidenceSignals: ["structured_data"],
              },
              usage: catalogUsage,
            } satisfies MetadataObservation,
          ],
          observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
        },
      },
    ]);

    expect(merged.title).toBe("Les Aventuriers du Rail");
  });

  it("keeps legacy regional ranking when no display observation can be consumed", () => {
    const merged = mergeMetadata("boardgames", [
      {
        providerId: "screenscraper",
        metadata: {
          title: "Mille Sabords - Complet Boite Notice",
          regionalTitles: [
            { region: "fr", text: "Mille Sabords - Complet Boite Notice" },
          ],
        },
      },
      {
        providerId: "okkazeo",
        metadata: {
          title: "Mille Sabords",
          regionalTitles: [{ region: "wor", text: "Mille Sabords" }],
        },
      },
    ]);

    expect(merged.title).toBe("Mille Sabords - Complet Boite Notice");
  });

  it("merges game metadata correctly matching legacy outcomes", () => {
    const hltb: MetadataResult = {
      title: "Commandos 2 : Men Of Courage",
      facts: [
        {
          kind: "time-to-beat",
          label: "Durée",
          value: "55 h",
          source: "How Long to Beat",
        },
      ],
    };
    const rawg: MetadataResult = {
      title: "Commandos 2: Men of Courage",
      facts: [
        {
          kind: "duration",
          label: "Temps de jeu",
          value: "1 h",
          source: "RAWG",
        },
        {
          kind: "rating",
          label: "RAWG",
          value: "4.2/5",
          source: "RAWG",
        },
      ],
    };

    const merged = mergeMetadata("games", [
      { providerId: "howlongtobeat", metadata: hltb },
      { providerId: "rawg", metadata: rawg },
    ]);

    expect(merged.title).toContain("Commandos 2");
    expect(
      merged.facts?.some(
        (fact) => fact.source === "rawg" && fact.kind === "duration",
      ),
    ).toBe(false);
    expect(
      merged.facts?.some(
        (fact) =>
          fact.source === "How Long to Beat" || fact.source === "howlongtobeat",
      ),
    ).toBe(true);
  });

  it("n'emprunte pas l'ean d'un provider dont le titre catalogue diverge", () => {
    const chipweld: MetadataResult = {
      title: "The Last of Us Part II PS4",
      barcode: "711719330103",
    };
    const igdb: MetadataResult = {
      title: "The Last of Us Part I",
      barcode: "0711719405399",
    };

    const merged = mergeMetadata(
      "games",
      [
        { providerId: "chipweld", metadata: chipweld },
        { providerId: "igdb", metadata: igdb },
      ],
      { requestedTitle: "The Last of Us Part I" },
    );

    expect(merged.barcode).toBe("0711719405399");
  });

  it("merges book metadata correctly matching legacy outcomes", () => {
    const openlibrary: MetadataResult = {
      title: "Fantastic Mr. Fox",
      barcode: "9780140328721",
      pageCount: 96,
      releaseDate: "1974-06-01",
      authors: [{ name: "Roald Dahl" }],
    };
    const googlebooks: MetadataResult = {
      title: "Fantastic Mr Fox",
      pageCount: 95,
      description: "Longer synopsis from Google Books.",
      imageUrl: "https://books.google.com/cover.jpg",
    };

    const merged = mergeMetadata("books", [
      { providerId: "openlibrary", metadata: openlibrary },
      { providerId: "googlebooks", metadata: googlebooks },
    ]);

    expect(merged.title).toBe("Fantastic Mr. Fox");
    expect(merged.pageCount).toBe(96);
    expect(merged.description).toBe("Longer synopsis from Google Books.");
    expect(merged.imageUrl).toBe("https://books.google.com/cover.jpg");
    expect(merged.barcode).toBe("9780140328721");
  });

  it("indexe les titres provider alternatifs dans aliases pour la recherche", () => {
    const merged = mergeMetadata("books", [
      {
        providerId: "bedetheque",
        metadata: {
          title: "L'Attaque des Titans n°1",
          aliases: ["Shingeki no Kyojin"],
        },
      },
      {
        providerId: "openlibrary",
        metadata: {
          title: "Attack on Titan, Vol. 1",
        },
      },
    ]);

    expect(merged.aliases).toEqual(
      expect.arrayContaining([
        "L'Attaque des Titans n°1",
        "Shingeki no Kyojin",
      ]),
    );
  });

  it("prefers Booknode covers over OpenLibrary when both are present", () => {
    const merged = mergeMetadata("books", [
      {
        providerId: "booknode",
        metadata: {
          title: "Super Picsou Géant n°26",
          imageUrl: "https://cdn1.booknode.com/book_cover/1255/full/super-picsou-geant-n26-1254911.jpg",
          attachments: [
            {
              type: "cover",
              url: "https://cdn1.booknode.com/book_cover/1255/full/super-picsou-geant-n26-1254911.jpg",
              source: "booknode",
            },
          ],
        },
      },
      {
        providerId: "openlibrary",
        metadata: {
          title: "Super Picsou Géant n°26",
          imageUrl: "https://covers.openlibrary.org/b/id/14424812-L.jpg",
          attachments: [
            {
              type: "cover",
              url: "https://covers.openlibrary.org/b/id/14424812-L.jpg",
              source: "openlibrary",
            },
          ],
        },
      },
    ]);

    expect(merged.imageUrl).toBe(
      "https://cdn1.booknode.com/book_cover/1255/full/super-picsou-geant-n26-1254911.jpg",
    );
    expect(
      merged.attachments?.some(
        (attachment) =>
          attachment.source === "openlibrary" && attachment.type === "image",
      ),
    ).toBe(true);
    expect(
      merged.attachments?.some(
        (attachment) =>
          attachment.source === "openlibrary" && attachment.type === "cover",
      ),
    ).toBe(false);
  });

  it("prefers Bédéthèque scans over Booknode photos when both are present", () => {
    const merged = mergeMetadata("books", [
      {
        providerId: "booknode",
        metadata: {
          title: "Super Picsou Géant n°08",
          imageUrl:
            "https://cdn1.booknode.com/book_cover/1255/mod11/super-picsou-geant-n8-1254911-211-300.webp",
          attachments: [
            {
              type: "cover",
              url: "https://cdn1.booknode.com/book_cover/1255/mod11/super-picsou-geant-n8-1254911-211-300.webp",
              source: "booknode",
            },
          ],
        },
      },
      {
        providerId: "bedetheque",
        metadata: {
          title: "Super Picsou Géant n°08",
          imageUrl:
            "https://www.bedetheque.com/media/Couvertures/Couv_56641.jpg",
          attachments: [
            {
              type: "cover",
              url: "https://www.bedetheque.com/media/Couvertures/Couv_56641.jpg",
              source: "bedetheque",
              role: "fr",
            },
          ],
        },
      },
    ]);

    expect(merged.imageUrl).toBe(
      "https://www.bedetheque.com/media/Couvertures/Couv_56641.jpg",
    );
  });

  it("merges externalIds prioritizing higher weighted providers", () => {
    const tmdb: MetadataResult = {
      title: "Toy Story",
      externalIds: { imdb: "tt0114709" },
    };
    const omdb: MetadataResult = {
      title: "Toy Story",
      externalIds: { imdb: "tt0114709_different", launchbox: "123" },
    };

    const merged = mergeMetadata("movies", [
      { providerId: "tmdb", metadata: tmdb },
      { providerId: "omdb", metadata: omdb },
    ]);

    expect(merged.externalIds).toEqual({
      imdb: "tt0114709", // tmdb has higher weight than omdb
      launchbox: "123", // only omdb has launchbox
    });
  });

  it("prefers cover_front image observations over listing photos", () => {
    const catalogImageUsage = makeObservationUsage({
      displayCandidate: true,
      evidence: "strong",
    });
    const listingImageUsage = makeObservationUsage({
      displayCandidate: false,
      evidence: "weak",
    });

    const merged = mergeMetadata("boardgames", [
      {
        providerId: "ebay",
        metadata: {
          title: "Mille Sabords",
          imageUrl: "https://example.test/listing.jpg",
          observations: [
            {
              kind: "image",
              role: "listing_photo",
              type: "cover",
              url: "https://example.test/listing.jpg",
              provenance: {
                providerId: "ebay",
                sourceDocumentRole: "marketplace_listing",
                evidenceSignals: [],
              },
              usage: listingImageUsage,
            } satisfies MetadataObservation,
          ],
          observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
        },
      },
      {
        providerId: "philibert",
        metadata: {
          title: "Mille Sabords",
          imageUrl: "https://example.test/catalog.jpg",
          observations: [
            {
              kind: "image",
              role: "cover_front",
              type: "cover",
              url: "https://example.test/catalog.jpg",
              provenance: {
                providerId: "philibert",
                sourceDocumentRole: "catalog_product",
                evidenceSignals: ["structured_data"],
              },
              usage: catalogImageUsage,
            } satisfies MetadataObservation,
          ],
          observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
        },
      },
    ]);

    expect(merged.imageUrl).toBe("https://example.test/catalog.jpg");
  });

  it("prefers structured fact observations over weaker listing facts", () => {
    const catalogUsage = makeObservationUsage({
      displayCandidate: true,
      evidence: "strong",
    });
    const listingUsage = makeObservationUsage({
      displayCandidate: false,
      evidence: "weak",
    });

    const merged = mergeMetadata("boardgames", [
      {
        providerId: "ebay",
        metadata: {
          title: "Mille Sabords",
          observations: [
            {
              kind: "fact",
              role: "listing_fact",
              factKind: "players",
              label: "Joueurs",
              value: "1-99",
              provenance: {
                providerId: "ebay",
                sourceDocumentRole: "marketplace_listing",
                evidenceSignals: [],
              },
              usage: listingUsage,
            } satisfies MetadataObservation,
          ],
          observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
        },
      },
      {
        providerId: "philibert",
        metadata: {
          title: "Mille Sabords",
          observations: [
            {
              kind: "fact",
              role: "structured_fact",
              factKind: "players",
              label: "Joueurs",
              value: "2 à 4",
              provenance: {
                providerId: "philibert",
                sourceDocumentRole: "catalog_product",
                evidenceSignals: ["structured_data"],
              },
              usage: catalogUsage,
            } satisfies MetadataObservation,
          ],
          observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
        },
      },
    ]);

    expect(merged.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "players",
          value: "2 à 4",
          source: "philibert",
        }),
      ]),
    );
    expect(
      merged.facts?.some(
        (fact) => fact.kind === "players" && fact.value === "1-99",
      ),
    ).toBe(false);
  });
});
