import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchMetadataByType } from "./fetch";
import type { MetadataResult } from "@/types/metadataProvider";
import type { MetadataAdapterContext } from "@/types/providerModule";

// Mock the resolvers map to return test data
const defaultImplementation = async (
  ctx: MetadataAdapterContext,
  id: string,
) => {
  if (ctx.name === "failing") return null;
  // Use the requested title so providers with requiresTitleAlignment survive
  // residual gates (provider-id prefixes are unexplained candidate identity).
  return {
    title: ctx.name,
    description: `Description from ${id}`,
  } as MetadataResult;
};

const mockResolve = vi.fn().mockImplementation(defaultImplementation);
vi.mock("@/core/catalog/bootstrap", () => ({
  metadataProviderResolverMap: {
    get: (id: string) => ({
      id,
      resolve: (ctx: MetadataAdapterContext) => mockResolve(ctx, id),
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
      mockResolve.mock.calls.some((call) => call[0]?.type === "books"),
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
          imageUrl: "https://img.example/pokemon-yellow-gbc.jpg",
        } as MetadataResult;
      }
      if (id === "pricecharting") {
        return {
          title: "Pokemon Yellow",
          platformKey: "gb",
          imageUrl: "https://img.example/pokemon-yellow-gb.jpg",
          description: "Correct Game Boy",
        } as MetadataResult;
      }
      return null;
    });

    // Same-language title: this case asserts platform filtering, not FR↔EN invent.
    const res = await fetchMetadataByType(
      "Pokemon Yellow",
      "games",
      null,
      "Nintendo Game Boy",
    );

    expect(res?.imageUrl).toBe("https://img.example/pokemon-yellow-gb.jpg");
    // pricecharting has no `description` capability — merge must not adopt
    // marketplace prose from price-only providers.
    expect(res?.description).not.toBe("Wrong platform");
  });

  it("n'adopte pas une jaquette SensCritique sans plateforme sur un shelf console", async () => {
    mockResolve.mockImplementation(async (_ctx, id) => {
      if (id === "screenscraper") {
        return {
          title: "Schtroumpfs",
          platformKey: "atari2600",
          description: "Rescue in Gargamel's Castle",
          imageUrl: "https://img.example/schtroumpfs-atari.jpg",
          attachments: [
            {
              type: "cover",
              url: "https://img.example/schtroumpfs-atari.jpg",
              source: "screenscraper",
              platformKey: "atari2600",
            },
          ],
        } as MetadataResult;
      }
      if (id === "senscritique") {
        return {
          title: "Les Schtroumpfs",
          // Title-only hit: no platformKey (must not inherit Atari).
          description: "SNES 1994",
          imageUrl: "https://img.example/schtroumpfs-snes.png",
          attachments: [
            {
              type: "cover",
              url: "https://img.example/schtroumpfs-snes.png",
              source: "senscritique",
            },
          ],
          facts: [
            {
              kind: "release-year",
              label: "Année",
              value: "1994",
              source: "senscritique",
            },
          ],
        } as MetadataResult;
      }
      if (id === "wikidata") {
        return {
          title: "Schtroumpfs Kart",
          description: "Kart racing",
          facts: [
            {
              kind: "genre",
              label: "Genres",
              value: "jeu de course de karting",
              source: "wikidata",
            },
          ],
        } as MetadataResult;
      }
      return null;
    });

    const res = await fetchMetadataByType(
      "Schtroumpfs",
      "games",
      null,
      "ATARI 2600",
    );

    expect(res?.imageUrl).toBe("https://img.example/schtroumpfs-atari.jpg");
    expect(res?.description).toBe("Rescue in Gargamel's Castle");
    expect(res?.facts?.some((f) => f.value === "1994") ?? false).toBe(false);
    expect(
      res?.facts?.some((f) => /karting/i.test(f.value ?? "")) ?? false,
    ).toBe(false);
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

    const secondaryCall = mockResolve.mock.calls.find((call) => {
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
          platformKey: "ps4",
          imageUrl: "https://img.example/igdb-cover.jpg",
          attachments: [
            {
              type: "cover",
              url: "https://img.example/igdb-cover.jpg",
              source: "igdb",
              platformKey: "ps4",
            },
          ],
        } as MetadataResult;
      }
      if (id === "chocobonplan") {
        return {
          title: "Assassin's Creed Valhalla DLC Aube du Ragnarok sur PS4",
          platformKey: "ps4",
          attachments: [
            {
              type: "cover",
              url: "https://img.example/cbp-cover.png",
              source: "chocobonplan",
              platformKey: "ps4",
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
      mockResolve.mock.calls.some((call) => call[1] === "chocobonplan"),
    ).toBe(true);
    expect(
      res?.attachments?.some(
        (attachment) => attachment.source === "chocobonplan",
      ),
    ).toBe(true);
  });

  it("still queries marketplace listing scrapes for hardware when stage 1 already has a cover", async () => {
    mockResolve.mockImplementation(async (_ctx, id) => {
      if (id === "pricecharting") {
        return {
          title: "Nintendo Wii Bleu",
          imageUrl: "https://img.example/pc-wii.jpg",
          attachments: [
            {
              type: "cover",
              url: "https://img.example/pc-wii.jpg",
              source: "pricecharting",
            },
          ],
        } as MetadataResult;
      }
      if (id === "backmarket") {
        return {
          title: "Nintendo Wii - Bleu",
          imageUrl: "https://img.example/bm-wii.jpg",
          attachments: [
            {
              type: "cover",
              url: "https://img.example/bm-wii.jpg",
              source: "backmarket",
            },
          ],
          facts: [
            {
              kind: "external-link",
              label: "Back Market",
              value: "Voir la fiche",
              url: "https://www.backmarket.fr/fr-fr/p/console-nintendo-wii-bleu/7383740a-64c1-4b44-aa1c-b65a512979a1",
              source: "backmarket",
            },
          ],
        } as MetadataResult;
      }
      return null;
    });

    const res = await fetchMetadataByType("Nintendo Wii Bleu", "hardware", null, null, {
      shelfName: "Consoles",
    });

    expect(
      mockResolve.mock.calls.some((call) => call[1] === "backmarket"),
    ).toBe(true);
    expect(
      res?.facts?.some(
        (fact) =>
          fact.source === "backmarket" && fact.kind === "external-link",
      ),
    ).toBe(true);
  });

  it("skips gameMediaGallerySource providers when stage 1 already has a rich gallery", async () => {
    mockResolve.mockImplementation(async (_ctx, id) => {
      if (id === "screenscraper") {
        return {
          title: "The Legend of Zelda: Twilight Princess",
          imageUrl: "https://img.example/ss-cover.jpg",
          attachments: [
            {
              type: "cover",
              url: "https://img.example/ss-cover.jpg",
              source: "screenscraper",
            },
            {
              type: "cover",
              url: "https://img.example/ss-cover-3d.jpg",
              source: "screenscraper",
            },
            {
              type: "screenshot",
              url: "https://img.example/ss-shot.jpg",
              source: "screenscraper",
            },
          ],
        } as MetadataResult;
      }
      if (id === "chocobonplan") {
        return {
          title: "Zelda Twilight Princess sur GameCube",
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

    await fetchMetadataByType(
      "The Legend of Zelda: Twilight Princess",
      "games",
      null,
      "gamecube",
      { shelfName: "Jeux vidéo" },
    );

    expect(
      mockResolve.mock.calls.some((call) => call[1] === "chocobonplan"),
    ).toBe(false);
  });

  it("still queries gameMediaGallerySource providers on platform-specific shelves with a rich gallery", async () => {
    mockResolve.mockImplementation(async (_ctx, id) => {
      if (id === "screenscraper") {
        return {
          title: "Shock Troopers",
          imageUrl: "https://img.example/ss-cover.jpg",
          attachments: [
            {
              type: "cover",
              url: "https://img.example/ss-cover.jpg",
              source: "screenscraper",
            },
            {
              type: "cover",
              url: "https://img.example/ss-cover-3d.jpg",
              source: "screenscraper",
            },
            {
              type: "screenshot",
              url: "https://img.example/ss-shot.jpg",
              source: "screenscraper",
            },
          ],
        } as MetadataResult;
      }
      if (id === "chocobonplan") {
        return {
          title: "[Précommande] Shock Troopers sur NEOGEO AES+",
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

    await fetchMetadataByType("Shock Troopers", "games", null, "neogeo", {
      shelfName: "NEO GEO AES+",
    });

    expect(
      mockResolve.mock.calls.some((call) => call[1] === "chocobonplan"),
    ).toBe(true);
  });

  it("still queries chocobonplan for books when stage 1 only has catalog covers", async () => {
    mockResolve.mockImplementation(async (_ctx, id) => {
      if (id === "openlibrary") {
        return {
          title: "L'Art et la Création de Arcane",
          description: "Artbook Arcane",
          imageUrl: "https://covers.openlibrary.org/b/id/123-L.jpg",
          attachments: [
            {
              type: "cover",
              url: "https://covers.openlibrary.org/b/id/123-L.jpg",
              source: "openlibrary",
            },
          ],
        } as MetadataResult;
      }
      if (id === "chocobonplan") {
        return {
          title: "Artbook L'art et la création de Arcane",
          attachments: [
            {
              type: "cover",
              url: "https://chocobonplan.com/wp-content/uploads/cover.png",
              source: "chocobonplan",
            },
            {
              type: "screenshot",
              url: "https://chocobonplan.com/wp-content/uploads/screen.jpg",
              source: "chocobonplan",
            },
          ],
        } as MetadataResult;
      }
      return null;
    });

    const res = await fetchMetadataByType(
      "L'Art et la Création de Arcane",
      "books",
      "9791035505677",
      null,
      { shelfName: "Livres" },
    );

    expect(
      mockResolve.mock.calls.some((call) => call[1] === "chocobonplan"),
    ).toBe(true);
    expect(
      res?.attachments?.some(
        (attachment) => attachment.source === "chocobonplan",
      ),
    ).toBe(true);
  });

  it("does not fan out secondary scrape fallbacks when a barcode game is already pinned", async () => {
    mockResolve.mockImplementation(async (_ctx, id) => {
      if (id === "screenscraper") {
        return {
          title: "Alice : Retour au Pays de la Folie",
          attachments: [
            {
              type: "cover",
              url: "https://img.example/ss-cover.jpg",
              source: "screenscraper",
            },
            {
              type: "screenshot",
              url: "https://img.example/ss-shot.jpg",
              source: "screenscraper",
            },
          ],
          externalIds: { screenscraper: "16056" },
        } as MetadataResult;
      }
      if (id === "ebay") {
        return {
          title: "Alice: Madness Returns",
          imageUrl: "https://img.example/ebay.jpg",
        } as MetadataResult;
      }
      if (id === "geedie") {
        return {
          title: "Alice",
          imageUrl: "https://img.example/geedie.jpg",
          attachments: [
            {
              type: "cover",
              url: "https://img.example/geedie.jpg",
              source: "geedie",
            },
          ],
        } as MetadataResult;
      }
      return null;
    });

    await fetchMetadataByType(
      "Alice : Retour au Pays de la Folie",
      "games",
      "5030931097140",
      "xbox360",
      { shelfName: "Xbox 360" },
    );

    const ebayCalls = mockResolve.mock.calls.filter(
      (call) => call[1] === "ebay",
    );
    const geedieCalls = mockResolve.mock.calls.filter(
      (call) => call[1] === "geedie",
    );
    expect(ebayCalls.length).toBeLessThanOrEqual(1);
    expect(geedieCalls.length).toBeLessThanOrEqual(1);
  });

  it("invokes onApiPassComplete after the API pass before scrapes continue", async () => {
    const apiPassTitles: string[] = [];
    let scrapeStarted = false;
    mockResolve.mockImplementation(async (_ctx, id) => {
      if (id === "openlibrary") {
        return {
          title: "Wakfu Tome 3",
          description: "Les mines de Lamororia",
          imageUrl: "https://covers.openlibrary.org/b/id/1-L.jpg",
        } as MetadataResult;
      }
      if (id === "booknode" || id === "bedetheque" || id === "bdovore") {
        scrapeStarted = true;
        expect(apiPassTitles).toEqual(["Wakfu Tome 3"]);
        return {
          title: `scrape-${id}`,
          description: "from scrape",
          imageUrl: "https://cdn.example/scrape.jpg",
          attachments: [
            {
              type: "cover",
              url: "https://cdn.example/scrape.jpg",
              source: id,
            },
          ],
        } as MetadataResult;
      }
      return null;
    });

    const res = await fetchMetadataByType(
      "Wakfu Tome 3",
      "books",
      "9782331045678",
      null,
      {
        isBackground: true,
        onApiPassComplete: async (partial) => {
          apiPassTitles.push(partial.title ?? "");
        },
      },
    );

    expect(apiPassTitles).toEqual(["Wakfu Tome 3"]);
    expect(scrapeStarted).toBe(true);
    expect(res?.title).toBe("Wakfu Tome 3");
  });

  it("passes rebuilt externalIds and fiche URLs so providers can refresh by pin", async () => {
    mockResolve.mockImplementation(async (ctx, id) => {
      if (id === "bdovore") {
        expect(ctx.externalIds?.bdovore).toBe("51068");
        expect(ctx.providerRecordUrls?.bdovore).toContain("id_tome=51068");
        return {
          title: "Wakfu Tome 3",
          description: "from bdovore",
          imageUrl: "https://www.bdovore.com/images/couv/CV-051068-050605.jpg",
          attachments: [
            {
              type: "cover",
              url: "https://www.bdovore.com/images/couv/CV-051068-050605.jpg",
              source: "bdovore",
            },
          ],
          externalIds: { bdovore: "51068" },
        } as MetadataResult;
      }
      if (id === "openlibrary") {
        return {
          title: "Wakfu Tome 3",
          description: "Synopsis",
          imageUrl: "https://covers.openlibrary.org/b/id/1-L.jpg",
        } as MetadataResult;
      }
      return null;
    });

    await fetchMetadataByType("Wakfu Tome 3", "books", "9782331045678", null, {
      isBackground: true,
      existingExternalIds: { bdovore: "51068" },
      existingProviderRecordUrls: {
        bdovore: "https://www.bdovore.com/Album?id_tome=51068",
      },
      existingScrapeProviderIds: ["bdovore"],
    });

    expect(
      mockResolve.mock.calls.some((call) => call[1] === "bdovore"),
    ).toBe(true);
  });

  it("still runs scrapes when existing scrape sources are attached to the fiche", async () => {
    mockResolve.mockImplementation(async (_ctx, id) => {
      if (id === "openlibrary") {
        return {
          title: "Wakfu Tome 3",
          description: "Synopsis",
          imageUrl: "https://covers.openlibrary.org/b/id/1-L.jpg",
        } as MetadataResult;
      }
      if (id === "bedetheque") {
        return {
          title: "Wakfu Tome 3",
          description: "Synopsis Bedetheque",
          imageUrl: "https://cdn.bedetheque.com/cover.jpg",
          attachments: [
            {
              type: "cover",
              url: "https://cdn.bedetheque.com/cover.jpg",
              source: "bedetheque",
            },
          ],
        } as MetadataResult;
      }
      return null;
    });

    await fetchMetadataByType("Wakfu Tome 3", "books", "9782331045678", null, {
      isBackground: true,
      existingScrapeProviderIds: ["bedetheque"],
    });

    expect(
      mockResolve.mock.calls.some((call) => call[1] === "bedetheque"),
    ).toBe(true);
  });
});
