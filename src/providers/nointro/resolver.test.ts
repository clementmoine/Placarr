import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { __resetNoIntroIndexForTests, __setNoIntroIndexFromXmlForTests } from "./indexStore";
import {
  fetchFromNoIntro,
  mapNoIntroGameToMetadata,
  pickBestNoIntroGame,
} from "./resolver";

const FIXTURE_DAT = `<?xml version="1.0"?>
<datafile>
  <header>
    <name>Nintendo - Game Boy</name>
  </header>
  <game name="Tetris (World) (Rev 1)">
    <description>Tetris (World) (Rev 1)</description>
    <rom name="Tetris (World) (Rev 1).gb" size="32768" crc="46df91ad"/>
  </game>
  <game name="Tetris (Japan)" cloneof="Tetris (World) (Rev 1)">
    <description>Tetris (Japan)</description>
    <rom name="Tetris (Japan).gb" size="32768" crc="11111111"/>
  </game>
  <game name="Pokémon Red Version (USA, Europe)">
    <description>Pokémon Red Version (USA, Europe)</description>
    <rom name="red.gb" size="1048576" crc="dd88761c"/>
  </game>
</datafile>
`;

describe("nointro resolver", () => {
  beforeEach(() => {
    __resetNoIntroIndexForTests();
    __setNoIntroIndexFromXmlForTests(FIXTURE_DAT);
  });

  afterEach(() => {
    __resetNoIntroIndexForTests();
  });

  it("mappe un jeu indexé en MetadataResult (sans attachments)", () => {
    const metadata = mapNoIntroGameToMetadata({
      id: 1,
      name: "Tetris (World) (Rev 1)",
      description: "Tetris (World) (Rev 1)",
      datName: "Nintendo - Game Boy",
      roms: [{ name: "Tetris.gb", size: 32768, crc: "46df91ad" }],
    });
    expect(metadata.title).toBe("Tetris (World) (Rev 1)");
    expect(metadata.attachments).toBeUndefined();
    expect(metadata.externalIds).toEqual({ nointro: "1" });
    expect(metadata.facts?.some((fact) => fact.label === "CRC")).toBe(true);
    expect(metadata.platformKey).toBeTruthy();
  });

  it("choisit le meilleur titre aligné pour la plateforme", () => {
    const games = [
      {
        id: 1,
        name: "Tetris (World) (Rev 1)",
        datName: "Nintendo - Game Boy",
        roms: [{ name: "a.gb", crc: "46df91ad" }],
      },
      {
        id: 2,
        name: "Tetris (Japan)",
        cloneOf: "Tetris (World) (Rev 1)",
        datName: "Nintendo - Game Boy",
        roms: [{ name: "b.gb", crc: "11111111" }],
      },
    ];
    const best = pickBestNoIntroGame(games, "Tetris Japan", "Game Boy");
    expect(best?.name).toBe("Tetris (Japan)");
  });

  it("strip les flags région/rev pour l'alignement", async () => {
    const { stripNoIntroReleaseFlags } = await import("./resolver");
    expect(stripNoIntroReleaseFlags("Tetris (World) (Rev 1)")).toBe("Tetris");
    expect(
      stripNoIntroReleaseFlags("Pokémon Red Version (USA, Europe)"),
    ).toBe("Pokémon Red Version");
  });

  it("resolve via index FTS", async () => {
    const metadata = await fetchFromNoIntro("Pokémon Red", "Game Boy");
    expect(metadata?.title).toContain("Pokémon Red");
    expect(metadata?.externalIds?.nointro).toBeTruthy();
  });

  it("refuse un titre non aligné", async () => {
    await expect(fetchFromNoIntro("Completely Unrelated")).resolves.toBeNull();
  });
});
