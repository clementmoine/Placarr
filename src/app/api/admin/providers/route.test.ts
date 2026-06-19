import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  authReturn: { user: { role: "admin" } } as unknown,
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => h.authReturn),
}));

import { GET } from "./route";

const TMDB_API_KEY = "TMDB_API_KEY";
const OMDB_API_KEY = "OMDB_API_KEY";
const GOOGLE_BOOKS_API_KEY = "GOOGLE_BOOKS_API_KEY";
const BGG_API_TOKEN = "BGG_API_TOKEN";

describe("GET /api/admin/providers", () => {
  beforeEach(() => {
    h.authReturn = { user: { role: "admin" } } as unknown;
    delete process.env[TMDB_API_KEY];
    delete process.env[OMDB_API_KEY];
    delete process.env[BGG_API_TOKEN];
  });

  it("renvoie directement la réponse d'auth quand non-admin", async () => {
    h.authReturn = NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("signale 'missing' si une capacité n'a aucune source configurée", async () => {
    const response = await GET();
    const payload = await response.json();
    const movies = payload.coverage.find(
      (entry: { type: string }) => entry.type === "movies",
    );
    const rating = movies.capabilities.find(
      (entry: { capability: string }) => entry.capability === "rating",
    );

    expect(rating.providers).toEqual(expect.arrayContaining(["tmdb", "omdb"]));
    expect(rating.providers).toHaveLength(2);
    expect(rating.configuredCount).toBe(0);
    expect(rating.risk).toBe("missing");
  });

  it("signale 'single-source' quand une seule source est configurée", async () => {
    process.env[TMDB_API_KEY] = "fake-key";

    const response = await GET();
    const payload = await response.json();
    const movies = payload.coverage.find(
      (entry: { type: string }) => entry.type === "movies",
    );
    const rating = movies.capabilities.find(
      (entry: { capability: string }) => entry.capability === "rating",
    );

    expect(rating.providers).toEqual(expect.arrayContaining(["tmdb", "omdb"]));
    expect(rating.providers).toHaveLength(2);
    expect(rating.configuredCount).toBe(1);
    expect(rating.risk).toBe("single-source");
  });

  it("marque n/a les capacités sans provider déclaré", async () => {
    const response = await GET();
    const payload = await response.json();
    const movies = payload.coverage.find(
      (entry: { type: string }) => entry.type === "movies",
    );
    const screenshots = movies.capabilities.find(
      (entry: { capability: string }) => entry.capability === "screenshots",
    );

    expect(screenshots.providers).toHaveLength(0);
    expect(screenshots.risk).toBe("n/a");
  });

  it("couvre duration pour les jeux via HLTB, IGDB et RAWG", async () => {
    process.env.IGDB_CLIENT_ID = "fake-id";
    process.env.IGDB_CLIENT_SECRET = "fake-secret";
    process.env.RAWG_API_KEY = "fake-key";

    const response = await GET();
    const payload = await response.json();
    const games = payload.coverage.find(
      (entry: { type: string }) => entry.type === "games",
    );
    const duration = games.capabilities.find(
      (entry: { capability: string }) => entry.capability === "duration",
    );

    expect(duration.providers).toEqual(
      expect.arrayContaining(["howlongtobeat", "igdb", "rawg"]),
    );
    expect(duration.providers).toHaveLength(3);
    expect(duration.configuredCount).toBe(3);
    expect(duration.risk).toBe("ok");
  });

  it("couvre pageCount livres via OpenLibrary et Google Books", async () => {
    process.env[GOOGLE_BOOKS_API_KEY] = "fake-key";

    const response = await GET();
    const payload = await response.json();
    const books = payload.coverage.find(
      (entry: { type: string }) => entry.type === "books",
    );
    const pageCount = books.capabilities.find(
      (entry: { capability: string }) => entry.capability === "pageCount",
    );

    expect(pageCount.providers).toEqual(
      expect.arrayContaining(["openlibrary", "googlebooks"]),
    );
    expect(pageCount.configuredCount).toBe(2);
    expect(pageCount.risk).toBe("ok");
  });

  it("couvre rating livres via OpenLibrary et Google Books", async () => {
    process.env[GOOGLE_BOOKS_API_KEY] = "fake-key";

    const response = await GET();
    const payload = await response.json();
    const books = payload.coverage.find(
      (entry: { type: string }) => entry.type === "books",
    );
    const rating = books.capabilities.find(
      (entry: { capability: string }) => entry.capability === "rating",
    );

    expect(rating.providers).toEqual(
      expect.arrayContaining(["openlibrary", "googlebooks"]),
    );
    expect(rating.configuredCount).toBe(2);
    expect(rating.risk).toBe("ok");
  });

  it("couvre tracksCount pour la musique via Deezer et MusicBrainz", async () => {
    const response = await GET();
    const payload = await response.json();
    const musics = payload.coverage.find(
      (entry: { type: string }) => entry.type === "musics",
    );
    const tracksCount = musics.capabilities.find(
      (entry: { capability: string }) => entry.capability === "tracksCount",
    );

    expect(tracksCount.providers).toEqual(
      expect.arrayContaining(["deezer", "musicbrainz"]),
    );
    expect(tracksCount.configuredCount).toBe(2);
    expect(tracksCount.risk).toBe("ok");
  });

  it("couvre identify et cover pour les jeux de société via plusieurs scrapers", async () => {
    const response = await GET();
    const payload = await response.json();
    const boardgames = payload.coverage.find(
      (entry: { type: string }) => entry.type === "boardgames",
    );
    const identify = boardgames.capabilities.find(
      (entry: { capability: string }) => entry.capability === "identify",
    );
    const cover = boardgames.capabilities.find(
      (entry: { capability: string }) => entry.capability === "cover",
    );
    const price = boardgames.capabilities.find(
      (entry: { capability: string }) => entry.capability === "price",
    );

    expect(identify.providers).toEqual(
      expect.arrayContaining([
        "boardgamegeek",
        "scandex",
        "chasseauxlivres",
        "achatmoinscher",
        "picclick",
        "ledenicheur",
      ]),
    );
    expect(identify.configuredCount).toBeGreaterThanOrEqual(4);
    expect(identify.risk).toBe("ok");

    expect(cover.providers).toEqual(
      expect.arrayContaining([
        "boardgamegeek",
        "chasseauxlivres",
        "achatmoinscher",
        "picclick",
        "ledenicheur",
      ]),
    );
    expect(cover.configuredCount).toBeGreaterThanOrEqual(4);
    expect(cover.risk).toBe("ok");

    expect(price.providers).toEqual(
      expect.arrayContaining([
        "chasseauxlivres",
        "achatmoinscher",
        "picclick",
        "ledenicheur",
        "philibert",
        "monsieurde",
        "ludifolie",
        "bcdjeux",
        "lepassetemps",
      ]),
    );
    expect(price.configuredCount).toBeGreaterThanOrEqual(9);
    expect(price.risk).toBe("ok");
  });

  it("n'alerte pas en single-source quand BGG manque mais Philibert est actif", async () => {
    const response = await GET();
    const payload = await response.json();
    const boardgames = payload.coverage.find(
      (entry: { type: string }) => entry.type === "boardgames",
    );
    const rating = boardgames.capabilities.find(
      (entry: { capability: string }) => entry.capability === "rating",
    );

    expect(rating.providers).toEqual(
      expect.arrayContaining(["boardgamegeek", "philibert"]),
    );
    expect(rating.configuredCount).toBe(1);
    expect(rating.risk).toBe("ok");
  });

  it("n'alerte pas en single-source quand BGG manque mais Wikidata est actif", async () => {
    const response = await GET();
    const payload = await response.json();
    const boardgames = payload.coverage.find(
      (entry: { type: string }) => entry.type === "boardgames",
    );
    const releaseDate = boardgames.capabilities.find(
      (entry: { capability: string }) => entry.capability === "releaseDate",
    );

    expect(releaseDate.providers).toEqual(
      expect.arrayContaining(["boardgamegeek", "wikidata"]),
    );
    expect(releaseDate.configuredCount).toBeGreaterThanOrEqual(2);
    expect(releaseDate.risk).toBe("ok");
  });

  it("couvre people jeux de société via Philibert et Wikidata sans BGG", async () => {
    const response = await GET();
    const payload = await response.json();
    const boardgames = payload.coverage.find(
      (entry: { type: string }) => entry.type === "boardgames",
    );
    const people = boardgames.capabilities.find(
      (entry: { capability: string }) => entry.capability === "people",
    );

    expect(people.providers).toEqual(
      expect.arrayContaining(["boardgamegeek", "philibert", "wikidata"]),
    );
    expect(people.configuredCount).toBeGreaterThanOrEqual(2);
    expect(people.risk).toBe("ok");
  });

  it("couvre description jeux de société avec plusieurs sources metadata", async () => {
    process.env[BGG_API_TOKEN] = "fake-token";

    const response = await GET();
    const payload = await response.json();
    const boardgames = payload.coverage.find(
      (entry: { type: string }) => entry.type === "boardgames",
    );
    const description = boardgames.capabilities.find(
      (entry: { capability: string }) => entry.capability === "description",
    );

    expect(description.providers).toEqual(
      expect.arrayContaining(["boardgamegeek", "wikidata", "philibert"]),
    );
    expect(description.configuredCount).toBeGreaterThanOrEqual(3);
    expect(description.risk).toBe("ok");
  });
});
