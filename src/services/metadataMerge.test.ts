import { describe, expect, it } from "vitest";

import {
  mergeMetadata,
  preferRequestedDisplayTitle,
} from "@/services/metadataMerge";
import type { MetadataResult } from "@/types/metadataProvider";

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
      merged.facts?.some((fact) => fact.source === "How Long to Beat" || fact.source === "howlongtobeat"),
    ).toBe(true);
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
});
