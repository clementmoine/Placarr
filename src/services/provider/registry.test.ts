import { describe, it, expect } from "vitest";
import {
  PROVIDERS,
  providersForType,
  capabilityCoverage,
} from "./registry";

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

  it("révèle les trous connus (musique n'a aucune source d'âge)", () => {
    expect(capabilityCoverage("musics", "rating").providers).toContain(
      "chasseauxlivres",
    );
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

  it("livres : OpenLibrary, Google Books, Booknode et Chasse aux Livres couvrent les notes", () => {
    process.env.GOOGLE_BOOKS_API_KEY = "fake-key";
    expect(capabilityCoverage("books", "rating").providers).toContain(
      "openlibrary",
    );
    expect(capabilityCoverage("books", "rating").providers).toContain(
      "googlebooks",
    );
    expect(capabilityCoverage("books", "rating").providers).toContain(
      "booknode",
    );
    expect(capabilityCoverage("books", "rating").providers).toContain(
      "bedetheque",
    );
    expect(capabilityCoverage("books", "rating").providers).toContain(
      "chasseauxlivres",
    );
    expect(capabilityCoverage("books", "rating").count).toBeGreaterThanOrEqual(
      5,
    );
    delete process.env.GOOGLE_BOOKS_API_KEY;
  });

  it("films : TMDB/OMDb couvrent note ET public conseillé", () => {
    expect(capabilityCoverage("movies", "rating").providers).toContain("tmdb");
    expect(capabilityCoverage("movies", "rating").providers).toContain("omdb");
    expect(capabilityCoverage("movies", "ageRating").providers).toContain(
      "tmdb",
    );
    expect(capabilityCoverage("movies", "ageRating").providers).toContain(
      "omdb",
    );
  });

  it("jeux : la duree est couverte par HowLongToBeat", () => {
    expect(capabilityCoverage("games", "duration").providers).toContain(
      "howlongtobeat",
    );
  });

  it("jeux : les providers qui exposent les joueurs sont déclarés", () => {
    expect(capabilityCoverage("games", "players").providers).toEqual(
      expect.arrayContaining(["launchbox", "screenscraper", "thegamesdb"]),
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
    expect(
      capabilityCoverage("boardgames", "players").count,
    ).toBeGreaterThanOrEqual(6);
  });

  it("jeux de société : Wikidata et Philibert couvrent description avec BGG", () => {
    process.env.BGG_API_TOKEN = "fake-token";
    expect(capabilityCoverage("boardgames", "description").providers).toEqual(
      expect.arrayContaining(["boardgamegeek", "wikidata", "philibert"]),
    );
    expect(
      capabilityCoverage("boardgames", "description").count,
    ).toBeGreaterThanOrEqual(3);
    delete process.env.BGG_API_TOKEN;
  });

  it("providersForType ne renvoie que des providers du type", () => {
    for (const p of providersForType("books")) {
      expect(p.types).toContain("books");
    }
  });

  it("isbnCoverUrlForBarcode uses the registry template for books", async () => {
    const { isbnCoverUrlForBarcode } = await import("./registry");
    expect(isbnCoverUrlForBarcode("books", "9780140328721")).toBe(
      "https://covers.openlibrary.org/b/isbn/9780140328721-M.jpg",
    );
    expect(isbnCoverUrlForBarcode("games", "9780140328721")).toBeNull();
  });

  it("bookIsbnBootstrapProviderIds lists registry-declared bootstrap providers", async () => {
    const { bookIsbnBootstrapProviderIds } = await import("./registry");
    expect(bookIsbnBootstrapProviderIds()).toContain("chasseauxlivres");
  });

  it("nameDatabaseProviderForType picks the highest-weight owner per type", async () => {
    const { nameDatabaseProviderForType } = await import("./registry");
    expect(nameDatabaseProviderForType("games")?.id).toBe("igdb");
    expect(nameDatabaseProviderForType("movies")?.id).toBe("tmdb");
    expect(nameDatabaseProviderForType("books")?.id).toBe("openlibrary");
    expect(nameDatabaseProviderForType("musics")?.id).toBe("deezer");
    expect(nameDatabaseProviderForType("boardgames")?.id).toBe("boardgamegeek");
  });

  it("providerEvidenceLabelFor reads the module evidence label", async () => {
    const { providerEvidenceLabelFor } = await import("./registry");
    expect(providerEvidenceLabelFor("screenscraper")).toBe("ScreenScraper");
    expect(providerEvidenceLabelFor("pricecharting")).toBe("PriceCharting");
  });

  it("inferImageAttachmentFromMediaUrl delegates to the owning provider module", async () => {
    const { inferImageAttachmentFromMediaUrl } = await import(
      "./registry"
    );
    expect(
      inferImageAttachmentFromMediaUrl(
        "https://api.screenscraper.fr/api2/mediaJeu.php?systemeid=32&jeuid=14774&media=box-2D(fr)",
      ),
    ).toEqual({
      type: "cover",
      role: "fr",
      source: "screenscraper",
    });
    expect(
      inferImageAttachmentFromMediaUrl("https://example.com/cover.jpg"),
    ).toBeNull();
  });
});
