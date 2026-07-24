import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  __resetNoIntroIndexForTests,
  __setNoIntroIndexFromXmlForTests,
  buildNoIntroIndex,
  ensureNoIntroIndex,
  lookupNoIntroGamesByChecksum,
  searchNoIntroGamesByTitle,
} from "./indexStore";

const FIXTURE_DAT = `<?xml version="1.0"?>
<datafile>
  <header>
    <name>Nintendo - Game Boy</name>
    <description>Nintendo - Game Boy (fixture)</description>
  </header>
  <game name="Tetris (World) (Rev 1)">
    <description>Tetris (World) (Rev 1)</description>
    <rom name="Tetris (World) (Rev 1).gb" size="32768" crc="46df91ad" md5="982ed5d2b12a0377eb14bcdc41237494" sha1="9306510639ab3d52b27fc5bc5c0f5c4b4c1d3a4e"/>
  </game>
  <game name="Tetris (Japan)" cloneof="Tetris (World) (Rev 1)">
    <description>Tetris (Japan)</description>
    <rom name="Tetris (Japan).gb" size="32768" crc="11111111"/>
  </game>
  <game name="Pokémon Red Version (USA, Europe)">
    <description>Pokémon Red Version (USA, Europe)</description>
    <rom name="Pokémon Red Version (USA, Europe).gb" size="1048576" crc="dd88761c" sha1="ea9bcae617fdf159b045185467ae58b2e4a48b9a"/>
  </game>
</datafile>
`;

describe("No-Intro indexStore", () => {
  const originalDat = process.env.NOINTRO_DAT_PATH;
  const originalCache = process.env.NOINTRO_CACHE_DIR;
  const originalIndex = process.env.NOINTRO_INDEX_PATH;

  beforeEach(() => {
    __resetNoIntroIndexForTests();
    delete process.env.NOINTRO_DAT_PATH;
    process.env.NOINTRO_CACHE_DIR = "/tmp/placarr-nointro-missing";
    process.env.NOINTRO_INDEX_PATH =
      "/tmp/placarr-nointro-missing/nointro.sqlite";
  });

  afterEach(() => {
    __resetNoIntroIndexForTests();
    if (originalDat === undefined) delete process.env.NOINTRO_DAT_PATH;
    else process.env.NOINTRO_DAT_PATH = originalDat;
    if (originalCache === undefined) delete process.env.NOINTRO_CACHE_DIR;
    else process.env.NOINTRO_CACHE_DIR = originalCache;
    if (originalIndex === undefined) delete process.env.NOINTRO_INDEX_PATH;
    else process.env.NOINTRO_INDEX_PATH = originalIndex;
  });

  it("ensure returns null when no prebuilt index exists", async () => {
    await expect(ensureNoIntroIndex()).resolves.toBeNull();
  });

  it("lookup by crc / sha1 and title FTS from in-memory fixture", () => {
    const db = __setNoIntroIndexFromXmlForTests(FIXTURE_DAT);

    const byCrc = lookupNoIntroGamesByChecksum(db, { crc: "46DF91AD" });
    expect(byCrc).toHaveLength(1);
    expect(byCrc[0]).toMatchObject({
      name: "Tetris (World) (Rev 1)",
      datName: "Nintendo - Game Boy",
      roms: [{ crc: "46df91ad", size: 32768 }],
    });

    const bySha1 = lookupNoIntroGamesByChecksum(db, {
      sha1: "EA9BCAE617FDF159B045185467AE58B2E4A48B9A",
    });
    expect(bySha1[0]?.name).toBe("Pokémon Red Version (USA, Europe)");

    const byTitle = searchNoIntroGamesByTitle(db, "tetris japan");
    expect(byTitle.some((game) => game.name === "Tetris (Japan)")).toBe(true);
    expect(byTitle.find((game) => game.name === "Tetris (Japan)")?.cloneOf).toBe(
      "Tetris (World) (Rev 1)",
    );
  });

  it("buildNoIntroIndex writes sqlite from a local DAT file", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "placarr-nointro-"));
    const datFile = path.join(dir, "gb.dat");
    const sqliteFile = path.join(dir, "nointro.sqlite");
    await fs.writeFile(datFile, FIXTURE_DAT, "utf8");
    process.env.NOINTRO_CACHE_DIR = dir;
    process.env.NOINTRO_INDEX_PATH = sqliteFile;
    process.env.NOINTRO_DAT_PATH = datFile;

    const built = await buildNoIntroIndex();
    expect(built).not.toBeNull();
    __resetNoIntroIndexForTests();

    const opened = await ensureNoIntroIndex();
    expect(opened).not.toBeNull();
    const hits = lookupNoIntroGamesByChecksum(opened!, { crc: "11111111" });
    expect(hits[0]?.name).toBe("Tetris (Japan)");

    await fs.rm(dir, { recursive: true, force: true });
  });
});
