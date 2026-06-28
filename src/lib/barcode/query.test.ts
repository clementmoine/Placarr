import { describe, it, expect } from "vitest";

import {
  cleanCode,
  detectPlatformKey,
  guessShelfByPlatformKey,
  guessBestShelf,
  guessShelfFromBarcodeLookup,
  isShelfCompatibleWithPlatformKey,
} from "./query";

describe("cleanCode", () => {
  it("garde un EAN-13 numérique intact", () => {
    expect(cleanCode("3307211503465")).toBe("3307211503465");
  });

  it("retire tout caractère non numérique", () => {
    expect(cleanCode("3-307-211 503465")).toBe("3307211503465");
    expect(cleanCode(" 0045496365226 ")).toBe("0045496365226");
  });

  it("renvoie une chaîne vide pour null/undefined/vide", () => {
    expect(cleanCode(null)).toBe("");
    expect(cleanCode(undefined)).toBe("");
    expect(cleanCode("")).toBe("");
  });
});

describe("detectPlatformKey — précision plateforme (jamais de faux positif)", () => {
  it.each([
    ["Mario Kart Wii", "wii"],
    ["New Super Mario Bros. Wii", "wii"],
    ["Nintendo Land (Wii U)", "wiiu"],
    ["WiiU exclusive", "wiiu"],
    ["The Legend of Zelda: Breath of the Wild — Nintendo Switch", "switch"],
    ["Super Mario Sunshine GameCube", "gamecube"],
    ["GoldenEye 007 N64", "n64"],
    ["Super Mario World (SNES)", "snes"],
    ["Super Mario Bros NES", "nes"],
    ["Pokemon X 3DS", "3ds"],
    ["Mario Kart DS (NDS)", "ds"],
    ["Metroid Fusion Game Boy Advance", "gba"],
    ["Pokemon Crystal Game Boy Color", "gbc"],
    ["Tetris Game Boy", "gb"],
    ["The Last of Us PS3", "ps3"],
    ["God of War PlayStation 4", "ps4"],
    ["Gran Turismo PS2", "ps2"],
    ["Final Fantasy VII PlayStation", "ps1"],
    ["Halo Infinite Xbox Series X", "xboxseries"],
    ["Forza Xbox One", "xboxone"],
    ["Gears of War Xbox 360", "xbox360"],
    ["Xbox Original", "xbox"],
    ["Crazy Taxi Dreamcast", "dreamcast"],
    ["Sonic Mega Drive", "megadrive"],
  ])("'%s' → %s", (input, expected) => {
    expect(detectPlatformKey(input)).toBe(expected);
  });

  it("ne confond pas Wii U avec Wii (ordre de détection)", () => {
    expect(detectPlatformKey("Wii U")).toBe("wiiu");
    expect(detectPlatformKey("Wii")).toBe("wii");
  });

  it("ne confond pas Game Boy Advance avec Game Boy", () => {
    expect(detectPlatformKey("Game Boy Advance")).toBe("gba");
    expect(detectPlatformKey("Game Boy")).toBe("gb");
  });

  it("dit honnêtement 'je ne sais pas' (null) quand aucune plateforme n'est reconnue", () => {
    expect(detectPlatformKey("Le Petit Prince")).toBeNull();
    expect(detectPlatformKey("Catan board game")).toBeNull();
    expect(detectPlatformKey("")).toBeNull();
  });

  it("reconnaît les noms d'étagères utilisateur courants", () => {
    expect(detectPlatformKey("PlayStation")).toBe("ps1");
    expect(detectPlatformKey("PlayStation 1")).toBe("ps1");
    expect(detectPlatformKey("PS1")).toBe("ps1");
    expect(detectPlatformKey("PS2")).toBe("ps2");
    expect(detectPlatformKey("Xbox Original")).toBe("xbox");
    expect(detectPlatformKey("Atari 2600")).toBe("atari2600");
    expect(detectPlatformKey("Switch 2")).toBe("switch2");
  });

  it("ne confond pas l'éditeur Atari avec la plateforme Atari 2600", () => {
    expect(detectPlatformKey("Atari Flashback Classics")).toBeNull();
    expect(detectPlatformKey("Ryse : Son of Rome")).toBeNull();
  });
});

describe("guessShelfByPlatformKey — routage zéro-input", () => {
  const shelves = [
    { id: "s-wii", name: "Jeux Wii", type: "games" },
    { id: "s-ps4", name: "PS4", type: "games" },
    { id: "s-steam", name: "Steam", type: "games" },
    { id: "s-books", name: "Mes livres", type: "books" },
  ];

  it("route vers l'étagère de la bonne plateforme", () => {
    expect(guessShelfByPlatformKey("wii", shelves)).toEqual({
      shelfId: "s-wii",
      isGuessed: true,
    });
    expect(guessShelfByPlatformKey("pc", shelves)).toEqual({
      shelfId: "s-steam",
      isGuessed: true,
    });
    expect(guessShelfByPlatformKey("ps4", shelves)).toEqual({
      shelfId: "s-ps4",
      isGuessed: true,
    });
  });

  it("ne devine PAS (null) quand aucune étagère ne correspond", () => {
    expect(guessShelfByPlatformKey("xbox360", shelves)).toBeNull();
    expect(guessShelfByPlatformKey(null, shelves)).toBeNull();
    expect(guessShelfByPlatformKey("wii", [])).toBeNull();
  });
});

describe("guessBestShelf — devine via le titre, sinon s'abstient", () => {
  const shelves = [
    { id: "s-wii", name: "Wii", type: "games" },
    { id: "s-ps4", name: "PlayStation 4", type: "games" },
  ];

  it("devine l'étagère à partir de la plateforme contenue dans le titre", () => {
    expect(guessBestShelf("Mario Kart Wii", shelves)).toEqual({
      shelfId: "s-wii",
      isGuessed: true,
    });
  });

  it("s'abstient (null) quand le titre ne donne aucun signal exploitable", () => {
    expect(guessBestShelf("Un titre totalement inconnu", shelves)).toBeNull();
  });
});

describe("guessShelfFromBarcodeLookup — Ryse / Xbox One", () => {
  const shelves = [
    { id: "s-atari", name: "Atari 2600", type: "games" },
    { id: "s-xbox", name: "Xbox One", type: "games" },
    { id: "s-books", name: "Livres", type: "books" },
  ];

  it("route Ryse vers Xbox One via platformKey, pas la première étagère jeux", () => {
    expect(
      guessShelfFromBarcodeLookup({
        platformKey: "xboxone",
        searchNames: ["Ryse : Son of Rome"],
        shelves,
      }),
    ).toEqual({
      shelfId: "s-xbox",
      isGuessed: true,
    });
  });

  it("n'utilise pas une étagère préférée incompatible avec la plateforme détectée", () => {
    expect(
      guessShelfFromBarcodeLookup({
        platformKey: "xboxone",
        searchNames: ["Ryse : Son of Rome"],
        shelves,
        preferredShelfId: "s-atari",
      }),
    ).toEqual({
      shelfId: "s-xbox",
      isGuessed: true,
    });
  });

  it("peut conserver l'étagère courante quand elle est compatible", () => {
    expect(
      guessShelfFromBarcodeLookup({
        platformKey: "xboxone",
        searchNames: ["Ryse : Son of Rome"],
        shelves,
        preferredShelfId: "s-xbox",
      }),
    ).toEqual({
      shelfId: "s-xbox",
      isGuessed: true,
    });
  });

  it("s'abstient sans signal plateforme plutôt que de prendre la première étagère jeux", () => {
    expect(
      guessShelfFromBarcodeLookup({
        searchNames: ["Ryse : Son of Rome"],
        shelves,
        preferredShelfId: "s-atari",
      }),
    ).toBeNull();
  });
});

describe("guessShelfFromBarcodeLookup — étagère par format physique", () => {
  const shelves = [
    { id: "s-bd", name: "Blu-ray", type: "movies" },
    { id: "s-ld", name: "Laser Disc", type: "movies" },
  ];

  it("recommande l'étagère format (espace/casse-insensible) plutôt que la première du type", () => {
    // L'indice "LaserDisc" (sans espace) doit matcher l'étagère "Laser Disc".
    expect(
      guessShelfFromBarcodeLookup({
        shelfType: "movies",
        searchNames: ["Toy Story", "LaserDisc"],
        shelves,
        preferredShelfId: "s-bd",
      }),
    ).toEqual({ shelfId: "s-ld", isGuessed: true });
  });

  it("retombe sur l'étagère du type quand aucun format ne matche", () => {
    expect(
      guessShelfFromBarcodeLookup({
        shelfType: "movies",
        searchNames: ["Toy Story"],
        shelves,
        preferredShelfId: "s-bd",
      }),
    ).toEqual({ shelfId: "s-bd", isGuessed: true });
  });
});

describe("guessShelfFromBarcodeLookup — match par type résolu", () => {
  const shelves = [
    { id: "s-games", name: "Jeux Switch", type: "games" },
    { id: "s-bg", name: "Jeux de société", type: "boardgames" },
    { id: "s-books", name: "Livres", type: "books" },
  ];

  it("recommande l'étagère du type résolu quand ni plateforme ni nom ne matchent", () => {
    expect(
      guessShelfFromBarcodeLookup({
        shelfType: "boardgames",
        searchNames: ["Mille Sabords"],
        shelves,
      }),
    ).toEqual({ shelfId: "s-bg", isGuessed: true });
  });

  it("reste null si aucune étagère du type résolu n'existe", () => {
    expect(
      guessShelfFromBarcodeLookup({
        shelfType: "boardgames",
        searchNames: ["Mille Sabords"],
        shelves: [{ id: "s-games", name: "Jeux Switch", type: "games" }],
      }),
    ).toBeNull();
  });

  it("la plateforme l'emporte sur le type pour les jeux vidéo", () => {
    expect(
      guessShelfFromBarcodeLookup({
        shelfType: "games",
        platformKey: "switch",
        searchNames: ["Zelda"],
        shelves,
      }),
    ).toEqual({ shelfId: "s-games", isGuessed: true });
  });

  it("la plateforme détectée dans le titre reste prioritaire sur l'étagère jeux vidéo globale", () => {
    expect(
      guessShelfFromBarcodeLookup({
        shelfType: "games",
        searchNames: ["Mario Kart Wii"],
        shelves: [
          { id: "s-generic", name: "Jeux vidéo", type: "games" },
          { id: "s-wii", name: "Wii", type: "games" },
        ],
      }),
    ).toEqual({ shelfId: "s-wii", isGuessed: true });
  });

  it("utilise l'étagère jeux vidéo globale quand aucun signal spécifique ne matche", () => {
    expect(
      guessShelfFromBarcodeLookup({
        shelfType: "games",
        searchNames: ["Ryse : Son of Rome"],
        shelves: [
          { id: "s-atari", name: "Atari 2600", type: "games" },
          { id: "s-jv", name: "JV", type: "games" },
        ],
      }),
    ).toEqual({ shelfId: "s-jv", isGuessed: true });
  });

  it("préfère une étagère générique du type à une première étagère spécifique", () => {
    expect(
      guessShelfFromBarcodeLookup({
        shelfType: "boardgames",
        searchNames: ["Mille Sabords"],
        shelves: [
          { id: "s-black-stories", name: "Black Stories", type: "boardgames" },
          { id: "s-generic", name: "Jeux de société", type: "boardgames" },
        ],
      }),
    ).toEqual({ shelfId: "s-generic", isGuessed: true });
  });

  it("conserve le match fort par nom avant l'étagère générique", () => {
    expect(
      guessShelfFromBarcodeLookup({
        shelfType: "boardgames",
        searchNames: ["Unlock"],
        shelves: [
          { id: "s-generic", name: "Jeux de société", type: "boardgames" },
          { id: "s-unlock", name: "Unlock", type: "boardgames" },
        ],
      }),
    ).toEqual({ shelfId: "s-unlock", isGuessed: true });
  });

  it.each([
    ["games", "Halo", "Jeux vidéo"],
    ["books", "Dune", "Livres"],
    ["movies", "Alien", "Films"],
    ["musics", "Daft Punk", "Musique"],
    ["boardgames", "Unlock", "Jeux de société"],
  ])(
    "conserve le match fort par nom avant l'étagère générique pour %s",
    (shelfType, specificName, genericName) => {
      expect(
        guessShelfFromBarcodeLookup({
          shelfType,
          searchNames: [specificName],
          shelves: [
            { id: "s-generic", name: genericName, type: shelfType },
            { id: "s-specific", name: specificName, type: shelfType },
          ],
        }),
      ).toEqual({ shelfId: "s-specific", isGuessed: true });
    },
  );

  it("ignore une étagère homonyme d'un autre type quand le type est résolu", () => {
    expect(
      guessShelfFromBarcodeLookup({
        shelfType: "books",
        searchNames: ["Dune"],
        shelves: [
          { id: "s-movie-dune", name: "Dune", type: "movies" },
          { id: "s-books", name: "Livres", type: "books" },
        ],
      }),
    ).toEqual({ shelfId: "s-books", isGuessed: true });
  });

  it("garde le fallback vers la première étagère du type quand rien n'est proche", () => {
    expect(
      guessShelfFromBarcodeLookup({
        shelfType: "boardgames",
        searchNames: ["Mille Sabords"],
        shelves: [
          { id: "s-black-stories", name: "Black Stories", type: "boardgames" },
          { id: "s-unlock", name: "Unlock", type: "boardgames" },
        ],
      }),
    ).toEqual({ shelfId: "s-black-stories", isGuessed: true });
  });

  it.each([
    ["books", "Mes livres"],
    ["movies", "Films"],
    ["musics", "CD"],
    ["boardgames", "Jeux de société"],
  ])("reconnaît une étagère générique pour %s", (shelfType, shelfName) => {
    expect(
      guessShelfFromBarcodeLookup({
        shelfType,
        searchNames: ["Un titre sans lien"],
        shelves: [
          { id: "s-specific", name: "Une saga précise", type: shelfType },
          { id: "s-generic", name: shelfName, type: shelfType },
        ],
      }),
    ).toEqual({ shelfId: "s-generic", isGuessed: true });
  });
});

describe("isShelfCompatibleWithPlatformKey", () => {
  it("refuse Atari 2600 pour un jeu Xbox One", () => {
    expect(
      isShelfCompatibleWithPlatformKey(
        { id: "s-atari", name: "Atari 2600", type: "games" },
        "xboxone",
      ),
    ).toBe(false);
  });
});
