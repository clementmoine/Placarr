import { describe, expect, it } from "vitest";

import {
  filterRawgStoresForShelf,
  filterRawgTagsForShelf,
  pickRawgSearchMatch,
  preferResolvedRawgPlatformNames,
  readRawgCatalogAliases,
  readRawgGameplayClip,
} from "./resolver";

describe("readRawgGameplayClip", () => {
  it("returns the first HTTP clip URL with its label", () => {
    expect(
      readRawgGameplayClip({
        clips: {
          clips: [
            {
              clip: "https://media.rawg.io/media/clips/example.mp4",
              preview: "https://media.rawg.io/media/clips/example.jpg",
              video: "Trailer",
            },
          ],
        },
      }),
    ).toEqual({
      url: "https://media.rawg.io/media/clips/example.mp4",
      label: "Trailer",
    });
  });

  it("ignores entries without a usable clip URL", () => {
    expect(
      readRawgGameplayClip({
        clips: {
          clips: [{ clip: "", video: "Trailer" }, { clip: "ftp://bad" }],
        },
      }),
    ).toBeNull();
  });
});

describe("readRawgCatalogAliases", () => {
  it("collects name_original and alternative_names from detail", () => {
    expect(
      readRawgCatalogAliases({
        name_original: "Pokémon Yellow",
        alternative_names: [
          "Pokemon Jaune",
          { name: "Pocket Monsters Pikachu" },
        ],
      }),
    ).toEqual(["Pokémon Yellow", "Pokemon Jaune", "Pocket Monsters Pikachu"]);
  });
});

describe("pickRawgSearchMatch", () => {
  const retailYellow = {
    name: "Pokémon Yellow Version: Special Pikachu Edition",
    platforms: [
      { platform: { name: "Game Boy" } },
      { platform: { name: "Game Boy Color" } },
      { platform: { name: "Web" } },
    ],
  };
  const fangameOnlyWeb = {
    name: "Pokemon Yellow Version: Special Pikachu Edition",
    platforms: [{ platform: { name: "Web" } }],
  };

  it("prefers a Game Boy hit over a Web-only fangame", () => {
    expect(
      pickRawgSearchMatch(
        [fangameOnlyWeb, retailYellow],
        "Pokémon Yellow Version: Special Pikachu Edition",
        "Nintendo Gameboy",
      ),
    ).toEqual(retailYellow);
  });

  it("returns null when only a wrong-platform fangame aligns", () => {
    expect(
      pickRawgSearchMatch(
        [fangameOnlyWeb],
        "Pokémon Yellow Version: Special Pikachu Edition",
        "Nintendo Gameboy",
      ),
    ).toBeNull();
  });
});

describe("RAWG fact sanitizers", () => {
  it("drops Web when console platforms are present", () => {
    expect(
      preferResolvedRawgPlatformNames([
        "Game Boy",
        "Web",
        "Game Boy Color",
        "Nintendo",
      ]),
    ).toEqual(["Game Boy", "Game Boy Color", "Nintendo"]);
  });

  it("drops itch.io stores on a cartridge shelf", () => {
    expect(
      filterRawgStoresForShelf(
        ["itch.io", "Nintendo eShop"],
        "Nintendo Gameboy",
      ),
    ).toEqual(["Nintendo eShop"]);
  });

  it("drops fangame community tags on a cartridge shelf", () => {
    expect(
      filterRawgTagsForShelf(
        ["2D", "Horror", "GameMaker", "pokemon", "Fangame", "Game Boy"],
        "Nintendo Gameboy",
      ),
    ).toEqual(["2D", "pokemon", "Game Boy"]);
  });
});
