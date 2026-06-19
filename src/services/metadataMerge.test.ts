import { describe, expect, it } from "vitest";

import { mergeBookMetadata, mergeMusicMetadata } from "@/services/metadataMerge";
import type { MetadataResult } from "@/types/metadataProvider";

describe("mergeMusicMetadata", () => {
  it("priorise MusicBrainz pour le titre canonique et le nombre de pistes", () => {
    const musicbrainz: MetadataResult = {
      title: "Daft Punk - Discovery",
      barcode: "886443927087",
      tracksCount: 14,
      releaseDate: "2001-03-12",
      authors: [{ name: "Daft Punk" }],
    };
    const deezer: MetadataResult = {
      title: "Discovery",
      tracksCount: 13,
      releaseDate: "2001-03-13",
      imageUrl: "https://cdn.example.com/cover.jpg",
      authors: [{ name: "Daft Punk", imageUrl: "https://cdn.example.com/dp.jpg" }],
      facts: [{ kind: "genre", label: "Genres", value: "Electro", source: "deezer" }],
    };

    const merged = mergeMusicMetadata(musicbrainz, null, deezer);

    expect(merged.title).toBe("Daft Punk - Discovery");
    expect(merged.tracksCount).toBe(14);
    expect(merged.barcode).toBe("886443927087");
    expect(merged.releaseDate).toBe("2001-03-12");
    expect(merged.imageUrl).toBe("https://cdn.example.com/cover.jpg");
    expect(merged.authors).toEqual([
      { name: "Daft Punk", imageUrl: "https://cdn.example.com/dp.jpg" },
    ]);
    expect(merged.facts?.some((fact) => fact.value === "Electro")).toBe(true);
  });

  it("combine Discogs et Deezer quand MusicBrainz est absent", () => {
    const discogs: MetadataResult = {
      title: "Yoko Shimomura - Final Fantasy",
      releaseDate: "2002-01-01",
      imageUrl: "https://cdn.example.com/discogs.jpg",
      facts: [{ kind: "format", label: "Support", value: "CD", source: "discogs" }],
    };
    const deezer: MetadataResult = {
      title: "Final Fantasy",
      tracksCount: 18,
      attachments: [
        { type: "audio", title: "Prelude", duration: 180, url: "https://preview", source: "deezer" },
      ],
    };

    const merged = mergeMusicMetadata(null, discogs, deezer);

    expect(merged.title).toBe("Yoko Shimomura - Final Fantasy");
    expect(merged.tracksCount).toBe(18);
    expect(merged.imageUrl).toBe("https://cdn.example.com/discogs.jpg");
    expect(merged.attachments).toHaveLength(2);
    expect(merged.facts?.some((fact) => fact.value === "CD")).toBe(true);
  });
});

describe("mergeBookMetadata", () => {
  it("priorise OpenLibrary pour le titre et combine description Google Books", () => {
    const openlibrary: MetadataResult = {
      title: "Fantastic Mr. Fox",
      barcode: "9780140328721",
      pageCount: 96,
      releaseDate: "1974-06-01",
      authors: [{ name: "Roald Dahl" }],
      facts: [{ kind: "format", label: "Format", value: "Paperback", source: "openlibrary" }],
    };
    const googlebooks: MetadataResult = {
      title: "Fantastic Mr Fox",
      pageCount: 95,
      description: "Longer synopsis from Google Books.",
      imageUrl: "https://books.google.com/cover.jpg",
      facts: [
        {
          kind: "rating",
          label: "Google Books",
          value: "4.5/5",
          source: "googlebooks",
        },
      ],
    };

    const merged = mergeBookMetadata(openlibrary, googlebooks);

    expect(merged.title).toBe("Fantastic Mr. Fox");
    expect(merged.pageCount).toBe(96);
    expect(merged.description).toBe("Longer synopsis from Google Books.");
    expect(merged.imageUrl).toBe("https://books.google.com/cover.jpg");
    expect(merged.barcode).toBe("9780140328721");
    expect(merged.facts?.some((fact) => fact.value === "Paperback")).toBe(true);
    expect(merged.facts?.some((fact) => fact.value === "4.5/5")).toBe(true);
  });
});
