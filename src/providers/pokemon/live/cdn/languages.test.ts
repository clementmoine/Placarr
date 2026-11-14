import { describe, expect, it } from "vitest";

import {
  LIVE_LANG_TO_TCGDEX,
  POKEMON_CATALOGUE_LANGUAGES,
  POKEMON_CATALOGUE_LANGS_CSV,
  POKEMON_LIVE_DEFAULT_LANGUAGE,
  POKEMON_LIVE_LANGUAGES,
  POKEMON_LIVE_LANGS_CSV,
  POKEMON_LIVE_SCRAPE_DEFAULT_LANGUAGES,
  POKEMON_LIVE_SCRAPE_DEFAULT_LANGS_CSV,
  pokemonCardLangsToKeep,
  isPokemonLiveLanguage,
  tcgdexLangFromLive,
} from "./languages";

describe("pokemontcglive languages", () => {
  it("lists the six CDN-verified Live locales", () => {
    expect([...POKEMON_LIVE_LANGUAGES]).toEqual([
      "fr",
      "en",
      "de",
      "it",
      "es",
      "ptbr",
    ]);
    expect(POKEMON_LIVE_LANGS_CSV).toBe("fr,en,de,it,es,ptbr");
  });

  it("catalogue ingest is Live original EN + FR", () => {
    expect([...POKEMON_CATALOGUE_LANGUAGES]).toEqual(["en", "fr"]);
    expect(POKEMON_CATALOGUE_LANGS_CSV).toBe("en,fr");
  });

  it("defaults_scrape_to_fr_before_en_pass", () => {
    expect([...POKEMON_LIVE_SCRAPE_DEFAULT_LANGUAGES]).toEqual(["fr"]);
    expect(POKEMON_LIVE_SCRAPE_DEFAULT_LANGS_CSV).toBe("fr");
    expect(POKEMON_LIVE_DEFAULT_LANGUAGE).toBe("fr");
  });

  it("maps every Live lang onto a TCGdex locale", () => {
    expect(LIVE_LANG_TO_TCGDEX.ptbr).toBe("pt-br");
    for (const lang of POKEMON_LIVE_LANGUAGES) {
      expect(tcgdexLangFromLive(lang)).toBe(LIVE_LANG_TO_TCGDEX[lang]);
    }
    expect(tcgdexLangFromLive("ja")).toBeNull();
    expect(isPokemonLiveLanguage("pt")).toBe(false);
    expect(isPokemonLiveLanguage("ptbr")).toBe(true);
  });

  it("prune keep-set always retains catalogue en+fr", () => {
    expect(pokemonCardLangsToKeep(["fr"])).toEqual(["en", "fr"]);
    expect(pokemonCardLangsToKeep(["de"])).toEqual(["de", "en", "fr"]);
    expect(pokemonCardLangsToKeep(["fr", "en", "de", "it"])).toEqual([
      "de",
      "en",
      "fr",
      "it",
    ]);
  });
});
