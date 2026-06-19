import { describe, it, expect } from "vitest";
import {
  PROVIDERS,
  providersForType,
  capabilityCoverage,
} from "./providerRegistry";

describe("providerRegistry", () => {
  it("a des ids uniques", () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("chaque provider couvre au moins un type", () => {
    for (const p of PROVIDERS) {
      expect(p.types.length).toBeGreaterThan(0);
    }
  });

  it("les providers 'key' déclarent leurs variables d'env", () => {
    for (const p of PROVIDERS) {
      if (p.auth.kind === "key") {
        expect(p.auth.env.length).toBeGreaterThan(0);
      }
    }
  });

  it("identifie la couverture multi-source (jeux ont plusieurs sources d'identif)", () => {
    const { count } = capabilityCoverage("games", "identify");
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("révèle les trous connus (musique n'a aucune source de note/âge)", () => {
    expect(capabilityCoverage("musics", "rating").count).toBe(0);
    expect(capabilityCoverage("musics", "ageRating").count).toBe(0);
  });

  it("livres : OpenLibrary et Google Books couvrent description et pages", () => {
    expect(capabilityCoverage("books", "description").providers).toContain(
      "openlibrary",
    );
    expect(capabilityCoverage("books", "description").providers).toContain(
      "googlebooks",
    );
    expect(capabilityCoverage("books", "pageCount").providers).toContain(
      "openlibrary",
    );
    expect(capabilityCoverage("books", "pageCount").providers).toContain(
      "googlebooks",
    );
  });

  it("livres : OpenLibrary et Google Books couvrent les notes", () => {
    process.env.GOOGLE_BOOKS_API_KEY = "fake-key";
    expect(capabilityCoverage("books", "rating").providers).toContain(
      "openlibrary",
    );
    expect(capabilityCoverage("books", "rating").providers).toContain(
      "googlebooks",
    );
    expect(capabilityCoverage("books", "rating").count).toBe(2);
    delete process.env.GOOGLE_BOOKS_API_KEY;
  });

  it("films : TMDB/OMDb couvrent note ET public conseillé", () => {
    expect(capabilityCoverage("movies", "rating").providers).toContain("tmdb");
    expect(capabilityCoverage("movies", "rating").providers).toContain("omdb");
    expect(capabilityCoverage("movies", "ageRating").providers).toContain(
      "tmdb",
    );
    expect(capabilityCoverage("movies", "ageRating").providers).toContain("omdb");
  });

  it("jeux : la duree est couverte par HowLongToBeat", () => {
    expect(capabilityCoverage("games", "duration").providers).toContain(
      "howlongtobeat",
    );
  });

  it("jeux : Steam expose note, public et date de sortie", () => {
    expect(capabilityCoverage("games", "rating").providers).toContain("steam");
    expect(capabilityCoverage("games", "ageRating").providers).toContain(
      "steam",
    );
    expect(capabilityCoverage("games", "releaseDate").providers).toContain(
      "steam",
    );
  });

  it("jeux de société : BGG couvre durée et âge recommandé", () => {
    process.env.BGG_API_TOKEN = "fake-token";
    expect(capabilityCoverage("boardgames", "duration").providers).toContain(
      "boardgamegeek",
    );
    expect(capabilityCoverage("boardgames", "ageRating").providers).toContain(
      "boardgamegeek",
    );
    delete process.env.BGG_API_TOKEN;
  });

  it("jeux de société : retailers FR couvrent le nombre de joueurs", () => {
    expect(capabilityCoverage("boardgames", "players").providers).toEqual(
      expect.arrayContaining([
        "boardgamegeek",
        "philibert",
        "monsieurde",
        "ludifolie",
        "bcdjeux",
        "lepassetemps",
      ]),
    );
    expect(capabilityCoverage("boardgames", "players").count).toBeGreaterThanOrEqual(
      6,
    );
  });

  it("jeux de société : Wikidata et Philibert couvrent description avec BGG", () => {
    process.env.BGG_API_TOKEN = "fake-token";
    expect(capabilityCoverage("boardgames", "description").providers).toEqual(
      expect.arrayContaining(["boardgamegeek", "wikidata", "philibert"]),
    );
    expect(capabilityCoverage("boardgames", "description").count).toBeGreaterThanOrEqual(
      3,
    );
    delete process.env.BGG_API_TOKEN;
  });

  it("providersForType ne renvoie que des providers du type", () => {
    for (const p of providersForType("books")) {
      expect(p.types).toContain("books");
    }
  });
});
