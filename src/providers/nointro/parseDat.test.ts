import { describe, expect, it } from "vitest";

import {
  parseNoIntroDatGameBlock,
  parseNoIntroDatHeader,
  parseNoIntroDatXml,
} from "./parseDat";

/** Minimal Logiqx P/C XML fixture (GB-shaped), not a live No-Intro dump. */
const FIXTURE_DAT = `<?xml version="1.0"?>
<!DOCTYPE datafile PUBLIC "-//Logiqx//DTD ROM Management Datafile//EN" "http://www.logiqx.com/Dats/datafile.dtd">
<datafile>
  <header>
    <name>Nintendo - Game Boy</name>
    <description>Nintendo - Game Boy (fixture)</description>
    <version>20240101</version>
    <date>2024-01-01</date>
    <author>Placarr fixture</author>
    <homepage>https://www.no-intro.org</homepage>
    <url>https://datomatic.no-intro.org/</url>
  </header>
  <game name="Tetris (World) (Rev 1)">
    <description>Tetris (World) (Rev 1)</description>
    <rom name="Tetris (World) (Rev 1).gb" size="32768" crc="46df91ad" md5="982ed5d2b12a0377eb14bcdc41237494" sha1="9306510639ab3d52b27fc5bc5c0f5c4b4c1d3a4e"/>
  </game>
  <game name="Tetris (Japan)" cloneof="Tetris (World) (Rev 1)">
    <description>Tetris (Japan)</description>
    <rom name="Tetris (Japan).gb" size="32768" crc="11111111" md5="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" sha1="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"/>
  </game>
  <game name="Pokémon Red Version (USA, Europe)">
    <description>Pokémon Red Version (USA, Europe)</description>
    <rom name="Pokémon Red Version (USA, Europe).gb" size="1048576" crc="dd88761c" md5="3d45c1ee9abd5738df46d2dddce7be57" sha1="ea9bcae617fdf159b045185467ae58b2e4a48b9a" status="verified"/>
  </game>
  <game name="Multi &amp; Ampersand (USA)">
    <description>Multi &amp; Ampersand (USA)</description>
    <rom name="Multi &amp; Ampersand (USA).gb" size="1024" crc="deadbeef"/>
    <rom name="Multi &amp; Ampersand (USA).sav" size="8192" crc="cafebabe"/>
  </game>
</datafile>
`;

describe("parseNoIntroDatHeader", () => {
  it("lit le header Logiqx", () => {
    expect(parseNoIntroDatHeader(FIXTURE_DAT)).toEqual({
      name: "Nintendo - Game Boy",
      description: "Nintendo - Game Boy (fixture)",
      version: "20240101",
      date: "2024-01-01",
      author: "Placarr fixture",
      homepage: "https://www.no-intro.org",
      url: "https://datomatic.no-intro.org/",
    });
  });
});

describe("parseNoIntroDatGameBlock", () => {
  it("mappe name, description, rom hashes", () => {
    const block = `<game name="Tetris (World) (Rev 1)">
  <description>Tetris (World) (Rev 1)</description>
  <rom name="Tetris (World) (Rev 1).gb" size="32768" crc="46DF91AD" md5="ABC" sha1="DEF"/>
</game>`;
    expect(parseNoIntroDatGameBlock(block)).toEqual({
      name: "Tetris (World) (Rev 1)",
      description: "Tetris (World) (Rev 1)",
      cloneOf: undefined,
      roms: [
        {
          name: "Tetris (World) (Rev 1).gb",
          size: 32768,
          crc: "46df91ad",
          md5: "abc",
          sha1: "def",
          status: undefined,
        },
      ],
    });
  });

  it("lit cloneof + multi-rom", () => {
    const block = `<game name="Clone (Japan)" cloneof="Parent (USA)">
  <description>Clone (Japan)</description>
  <rom name="a.gb" size="1" crc="1"/>
  <rom name="b.sav" size="2" crc="2"/>
</game>`;
    expect(parseNoIntroDatGameBlock(block)).toMatchObject({
      name: "Clone (Japan)",
      cloneOf: "Parent (USA)",
      roms: [{ name: "a.gb" }, { name: "b.sav" }],
    });
  });
});

describe("parseNoIntroDatXml", () => {
  it("parse le fixture P/C (parents + clones + entities)", () => {
    const dat = parseNoIntroDatXml(FIXTURE_DAT);
    expect(dat.header.name).toBe("Nintendo - Game Boy");
    expect(dat.games).toHaveLength(4);

    expect(dat.games[0]).toMatchObject({
      name: "Tetris (World) (Rev 1)",
      cloneOf: undefined,
      roms: [{ crc: "46df91ad", size: 32768 }],
    });
    expect(dat.games[1]).toMatchObject({
      name: "Tetris (Japan)",
      cloneOf: "Tetris (World) (Rev 1)",
    });
    expect(dat.games[2]?.name).toBe("Pokémon Red Version (USA, Europe)");
    expect(dat.games[2]?.roms[0]?.status).toBe("verified");

    expect(dat.games[3]).toMatchObject({
      name: "Multi & Ampersand (USA)",
      description: "Multi & Ampersand (USA)",
      roms: [
        { name: "Multi & Ampersand (USA).gb", crc: "deadbeef" },
        { name: "Multi & Ampersand (USA).sav", crc: "cafebabe" },
      ],
    });
  });

  it("accepte aussi les balises machine (MAME-style)", () => {
    const dat = parseNoIntroDatXml(`<datafile>
  <header><name>Test</name></header>
  <machine name="Pac-Man (USA)">
    <description>Pac-Man (USA)</description>
    <rom name="pacman.rom" size="4096" crc="fee263b3"/>
  </machine>
</datafile>`);
    expect(dat.games).toEqual([
      {
        name: "Pac-Man (USA)",
        description: "Pac-Man (USA)",
        cloneOf: undefined,
        roms: [
          {
            name: "pacman.rom",
            size: 4096,
            crc: "fee263b3",
            md5: undefined,
            sha1: undefined,
            status: undefined,
          },
        ],
      },
    ]);
  });
});
