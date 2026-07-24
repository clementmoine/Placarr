import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { __resetNoIntroIndexForTests, __setNoIntroIndexFromXmlForTests } from "./indexStore";
import {
  fetchFromNoIntro,
  mapNoIntroGameToMetadata,
  pickBestNoIntroGame,
  resolveNoIntroMetadata,
  romChecksumsFromMetadataContext,
  stripNoIntroReleaseFlags,
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
    expect(metadata.externalIds).toEqual({ nointro: "1", crc: "46df91ad" });
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

  it("strip les flags région/rev pour l'alignement", () => {
    expect(stripNoIntroReleaseFlags("Tetris (World) (Rev 1)")).toBe("Tetris");
    expect(
      stripNoIntroReleaseFlags("Pokémon Red Version (USA, Europe)"),
    ).toBe("Pokémon Red Version");
  });

  it("lit les checksums depuis romChecksums ou externalIds", () => {
    expect(
      romChecksumsFromMetadataContext({
        romChecksums: { sha1: "EA9BCAE617FDF159B045185467AE58B2E4A48B9A" },
      }),
    ).toEqual({
      sha1: "EA9BCAE617FDF159B045185467AE58B2E4A48B9A",
      md5: undefined,
      crc: undefined,
    });
    expect(
      romChecksumsFromMetadataContext({
        externalIds: { crc32: "46df91ad" },
      }),
    ).toEqual({
      sha1: undefined,
      md5: undefined,
      crc: "46df91ad",
    });
  });

  it("resolve checksum-first even when the title would not match", async () => {
    const metadata = await resolveNoIntroMetadata({
      name: "Completely Unrelated",
      platform: "Game Boy",
      romChecksums: { crc: "46df91ad" },
    });
    expect(metadata?.title).toContain("Tetris");
    expect(metadata?.externalIds?.crc).toBe("46df91ad");
  });

  it("falls back to title FTS when the checksum misses", async () => {
    const metadata = await resolveNoIntroMetadata({
      name: "Pokémon Red",
      platform: "Game Boy",
      romChecksums: { crc: "deadbeef" },
    });
    expect(metadata?.title).toContain("Pokémon Red");
  });

  it("émet crc/md5/sha1 dans externalIds pour les passes suivantes", () => {
    const metadata = mapNoIntroGameToMetadata({
      id: 9,
      name: "Tetris (World) (Rev 1)",
      datName: "Nintendo - Game Boy",
      roms: [
        {
          name: "t.gb",
          crc: "46df91ad",
          md5: "982ed5d2b12a0377eb14bcdc41237494",
          sha1: "9306510639ab3d52b27fc5bc5c0f5c4b4c1d3a4e",
        },
      ],
    });
    expect(metadata.externalIds).toMatchObject({
      nointro: "9",
      crc: "46df91ad",
      md5: "982ed5d2b12a0377eb14bcdc41237494",
      sha1: "9306510639ab3d52b27fc5bc5c0f5c4b4c1d3a4e",
    });
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
