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
    { id: "s-books", name: "Mes livres", type: "books" },
  ];

  it("route vers l'étagère de la bonne plateforme", () => {
    expect(guessShelfByPlatformKey("wii", shelves)).toEqual({
      shelfId: "s-wii",
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
