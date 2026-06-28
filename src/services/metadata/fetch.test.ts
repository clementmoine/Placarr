import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchMetadataByType } from "./fetch";
import { metadataProviderResolverMap } from "@/services/provider/bootstrap";
import type { MetadataResult } from "@/types/metadataProvider";

// Mock the resolvers map to return test data
const defaultImplementation = async (ctx: any, id: string) => {
  if (ctx.name === "failing") return null;
  return {
    title: `${id} - ${ctx.name}`,
    description: `Description from ${id}`,
  } as MetadataResult;
};

const mockResolve = vi.fn().mockImplementation(defaultImplementation);
vi.mock("@/services/provider/bootstrap", () => ({
  metadataProviderResolverMap: {
    get: (id: string) => ({
      id,
      resolve: (ctx: any) => mockResolve(ctx, id),
    }),
  },
}));

describe("fetchMetadataByType generic routing", () => {
  beforeEach(() => {
    mockResolve.mockClear();
    mockResolve.mockImplementation(defaultImplementation);
  });

  it("returns null for unknown media type", async () => {
    const res = await fetchMetadataByType("Catan", "unknown-type");
    expect(res).toBeNull();
  });

  it("queries appropriate providers for books and merges their results", async () => {
    const res = await fetchMetadataByType("Fantastic Mr. Fox", "books");

    expect(res).not.toBeNull();
    expect(res?.title).toBe("Fantastic Mr. Fox"); // preferred requested title
    expect(res?.description).toContain("chasseauxlivres"); // description selected from high-weight/French chasseauxlivres
    expect(mockResolve).toHaveBeenCalled();
  });

  it("propage le type media aux adapters metadata", async () => {
    await fetchMetadataByType("Super Picsou Geant", "books");

    expect(
      mockResolve.mock.calls.some((call: any) => call[0]?.type === "books"),
    ).toBe(true);
  });

  it("ecarte les providers fuzzy non alignes avec le nom original", async () => {
    mockResolve.mockImplementation(async (_ctx, id) => {
      if (id === "openlibrary") {
        return {
          title: "Super Picsou Geant",
          description: "Description OpenLibrary",
        } as MetadataResult;
      }
      if (id === "chasseauxlivres") {
        return {
          title: "Le super livre qui n'a rien a voir",
          description: "Description Chasse erronee",
        } as MetadataResult;
      }
      return null;
    });

    const res = await fetchMetadataByType("Super Picsou Geant", "books");

    expect(res?.title).toBe("Super Picsou Geant");
    expect(res?.description).toBe("Description OpenLibrary");
  });

  it("ecarte les hits livre nom-seul trop faibles quand un provider trouve un EAN aligne", async () => {
    mockResolve.mockImplementation(async (_ctx, id) => {
      if (id === "openlibrary") {
        return {
          title: "Death Note - Tome 1",
          authors: [{ name: "Plato" }],
          publishers: [{ name: "Penguin Books" }],
        } as MetadataResult;
      }
      if (id === "chasseauxlivres") {
        return {
          title: "Death Note - Tome 1",
          barcode: "9782505000327",
          imageUrl: "https://img.example/death-note.jpg",
          authors: [{ name: "Tsugumi Ohba" }, { name: "Takeshi Obata" }],
          publishers: [{ name: "Kana" }],
        } as MetadataResult;
      }
      return null;
    });

    const res = await fetchMetadataByType("Death Note Tome 1", "books");

    expect(res?.barcode).toBe("9782505000327");
    expect(res?.authors?.map((author) => author.name)).toEqual([
      "Tsugumi Ohba",
      "Takeshi Obata",
    ]);
    expect(res?.publishers?.map((publisher) => publisher.name)).toEqual([
      "Kana",
    ]);
  });

  it("refuse un volume arbitraire quand la recherche livre nom-seul vise la serie", async () => {
    mockResolve.mockImplementation(async (_ctx, id) => {
      if (id === "openlibrary") {
        return {
          title: "Death Note",
          authors: [{ name: "Tsugumi Ohba" }],
          description: "Description serie",
        } as MetadataResult;
      }
      if (id === "chasseauxlivres") {
        return {
          title: "Death Note - Tome 1",
          barcode: "9782505000327",
          imageUrl: "https://img.example/death-note-tome-1.jpg",
        } as MetadataResult;
      }
      return null;
    });

    const res = await fetchMetadataByType("Death Note", "books");

    expect(res?.title).toBe("Death Note");
    expect(res?.barcode).toBeFalsy();
    expect(res?.imageUrl).toBeUndefined();
    expect(res?.description).toBe("Description serie");
  });

  it("conserve un hit livre nom-seul pauvre quand aucun provider n'a d'ancrage EAN", async () => {
    mockResolve.mockImplementation(async (_ctx, id) => {
      if (id === "openlibrary") {
        return {
          title: "Death Note",
          authors: [{ name: "Tsugumi Ohba" }],
          description: "Description OpenLibrary",
        } as MetadataResult;
      }
      return null;
    });

    const res = await fetchMetadataByType("Death Note", "books");

    expect(res?.authors?.map((author) => author.name)).toEqual([
      "Tsugumi Ohba",
    ]);
    expect(res?.description).toBe("Description OpenLibrary");
  });

  it("ecarte les metadata jeu qui ciblent une autre plateforme", async () => {
    mockResolve.mockImplementation(async (_ctx, id) => {
      if (id === "screenscraper") {
        return {
          title: "Pokemon Yellow",
          platformKey: "gbc",
          description: "Wrong platform",
        } as MetadataResult;
      }
      if (id === "pricecharting") {
        return {
          title: "Pokemon Yellow",
          platformKey: "gb",
          imageUrl: "https://img.example/pokemon-yellow-gb.jpg",
        } as MetadataResult;
      }
      return null;
    });

    const res = await fetchMetadataByType(
      "Pokemon Jaune",
      "games",
      null,
      "Nintendo Game Boy",
    );

    expect(res?.description).toBeUndefined();
    expect(res?.imageUrl).toBe("https://img.example/pokemon-yellow-gb.jpg");
  });

  it("propagates externalIds from Stage 1 to Stage 2 and fallback resolvers", async () => {
    mockResolve.mockImplementation(async (ctx, id) => {
      if (ctx.name === "Toy Story" && id === "tmdb") {
        return {
          title: "Toy Story",
          externalIds: { imdb: "tt0114709", customId: "prop-test" },
        } as MetadataResult;
      }
      return {
        title: `${id} - Toy Story Stub`,
      } as MetadataResult;
    });

    await fetchMetadataByType("Toy Story", "movies");

    const secondaryCall = mockResolve.mock.calls.find((call: any) => {
      const firstArg = call[0];
      const secondArg = call[1];
      return (
        secondArg === "omdb" && firstArg.externalIds?.customId === "prop-test"
      );
    });

    expect(secondaryCall).toBeDefined();
    expect(secondaryCall?.[0].externalIds?.imdb).toBe("tt0114709");
  });

  it("still queries gameMediaGallerySource providers when stage 1 already has a cover", async () => {
    mockResolve.mockImplementation(async (_ctx, id) => {
      if (id === "igdb") {
        return {
          title: "Assassin's Creed Valhalla l'Aube du Ragnarok",
          imageUrl: "https://img.example/igdb-cover.jpg",
          attachments: [
            {
              type: "cover",
              url: "https://img.example/igdb-cover.jpg",
              source: "igdb",
            },
          ],
        } as MetadataResult;
      }
      if (id === "chocobonplan") {
        return {
          title: "Assassin's Creed Valhalla DLC Aube du Ragnarok sur PS4",
          attachments: [
            {
              type: "cover",
              url: "https://img.example/cbp-cover.png",
              source: "chocobonplan",
            },
          ],
        } as MetadataResult;
      }
      return null;
    });

    const res = await fetchMetadataByType(
      "Assassin's Creed Valhalla l'Aube du Ragnarok",
      "games",
      null,
      "playstation-4",
      { shelfName: "PlayStation 4" },
    );

    expect(
      mockResolve.mock.calls.some((call: any) => call[1] === "chocobonplan"),
    ).toBe(true);
    expect(
      res?.attachments?.some((attachment) => attachment.source === "chocobonplan"),
    ).toBe(true);
  });
});
