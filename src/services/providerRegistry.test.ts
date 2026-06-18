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

  it("films : TMDB couvre note ET public conseillé", () => {
    expect(capabilityCoverage("movies", "rating").providers).toContain("tmdb");
    expect(capabilityCoverage("movies", "ageRating").providers).toContain(
      "tmdb",
    );
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

  it("providersForType ne renvoie que des providers du type", () => {
    for (const p of providersForType("books")) {
      expect(p.types).toContain("books");
    }
  });
});
