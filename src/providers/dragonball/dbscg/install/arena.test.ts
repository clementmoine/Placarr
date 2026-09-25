import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { packCardDir } from "@/lib/packPaths";

import { dbsFaceFilename } from "../disk/faceChoice";
import { DBS_CG_PACK_ID, resetDbsCgDbCache } from "../indexStore";
import {
  arenaStagingUsable,
  installArenaFaces,
  parseArenaFaceFilename,
  wipeUnusableArenaStaging,
} from "./arena";

let tinyWebpCache: Buffer | null = null;

beforeAll(async () => {
  const { default: sharp } = await import("sharp");
  tinyWebpCache = await sharp({
    create: {
      width: 40,
      height: 56,
      channels: 3,
      background: "#808080",
      noise: { type: "gaussian", mean: 128, sigma: 60 },
    },
  })
    .webp()
    .toBuffer();
});

function tinyWebp(): Buffer {
  if (!tinyWebpCache) throw new Error("tinyWebp not initialised");
  return tinyWebpCache;
}

describe("parseArenaFaceFilename", () => {
  it("files a collector as English art", () => {
    expect(parseArenaFaceFilename("BT1-001.webp")).toEqual({
      filename: "BT1-001.webp",
      collector: "BT1-001",
      set: "bt1",
      number: "001",
      grouping: null,
      role: "art",
    });
  });

  it("keeps SPR as grouping, not as a verso", () => {
    expect(parseArenaFaceFilename("BT1-011_SPR.webp")).toMatchObject({
      collector: "BT1-011_SPR",
      grouping: "spr",
      role: "art",
    });
  });

  it("treats _b as the Leader verso of the same print", () => {
    expect(parseArenaFaceFilename("BT1-001_b.webp")).toMatchObject({
      collector: "BT1-001",
      grouping: null,
      role: "back",
    });
  });

  it("ignores non-collector files", () => {
    expect(parseArenaFaceFilename("back.webp")).toBeNull();
    expect(parseArenaFaceFilename("cards.json")).toBeNull();
  });
});

describe("wipeUnusableArenaStaging", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), "dbscg-arena-wipe-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("removes a leftover incomplete clone (no .git, no assets)", () => {
    const root = path.join(tmp, "dragon-ball-masters-arena");
    mkdirSync(path.join(root, "src"), { recursive: true });
    writeFileSync(path.join(root, "src", "cards2.json"), "{}");
    expect(arenaStagingUsable(root)).toBe(false);
    expect(wipeUnusableArenaStaging(root)).toBe(true);
    expect(existsSync(root)).toBe(false);
  });

  it("keeps a dump that already has assets/", () => {
    const root = path.join(tmp, "dragon-ball-masters-arena");
    mkdirSync(path.join(root, "assets", "BT1"), { recursive: true });
    writeFileSync(path.join(root, "assets", "BT1", "BT1-001.webp"), "x");
    expect(arenaStagingUsable(root)).toBe(true);
    expect(wipeUnusableArenaStaging(root)).toBe(false);
    expect(existsSync(path.join(root, "assets", "BT1", "BT1-001.webp"))).toBe(
      true,
    );
  });

  it("keeps a real git clone even without assets yet", () => {
    const root = path.join(tmp, "dragon-ball-masters-arena");
    mkdirSync(path.join(root, ".git"), { recursive: true });
    writeFileSync(path.join(root, ".git", "HEAD"), "ref: refs/heads/main\n");
    expect(arenaStagingUsable(root)).toBe(true);
    expect(wipeUnusableArenaStaging(root)).toBe(false);
    expect(existsSync(path.join(root, ".git", "HEAD"))).toBe(true);
  });
});

describe("installArenaFaces", () => {
  let tmp: string;
  let prevData: string | undefined;
  let prevDb: string | undefined;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), "dbscg-arena-"));
    prevData = process.env.PLACARR_DATA_DIR;
    prevDb = process.env.PLACARR_DBSCG_DB;
    process.env.PLACARR_DATA_DIR = tmp;
    process.env.PLACARR_DBSCG_DB = path.join(tmp, "dragonball/cg/catalog.sqlite");
    resetDbsCgDbCache();
  });

  afterEach(() => {
    resetDbsCgDbCache();
    if (prevData === undefined) delete process.env.PLACARR_DATA_DIR;
    else process.env.PLACARR_DATA_DIR = prevData;
    if (prevDb === undefined) delete process.env.PLACARR_DBSCG_DB;
    else process.env.PLACARR_DBSCG_DB = prevDb;
    rmSync(tmp, { recursive: true, force: true });
  });

  it("ranges English faces under cards/{set}/en and keeps _b off the sleeve", async () => {
    const assets = path.join(tmp, "assets", "BT1");
    mkdirSync(assets, { recursive: true });
    writeFileSync(path.join(assets, "BT1-001.webp"), tinyWebp());
    writeFileSync(path.join(assets, "BT1-001_b.webp"), tinyWebp());
    writeFileSync(path.join(assets, "BT1-011_SPR.webp"), tinyWebp());

    const result = await installArenaFaces({
      assetsDir: path.join(tmp, "assets"),
    });
    expect(result.ok).toBe(2);
    expect(result.backs).toBe(1);

    const leader = packCardDir(DBS_CG_PACK_ID, {
      set: "bt1",
      lang: "en",
      card: "001",
    });
    expect(existsSync(path.join(leader, dbsFaceFilename("deckplanet")))).toBe(
      true,
    );
    expect(
      JSON.parse(readFileSync(path.join(leader, "face.json"), "utf8")).art,
    ).toBe("art.deckplanet.webp");
    expect(existsSync(path.join(leader, "back.deckplanet.webp"))).toBe(true);
    // A grouping variant is its own card folder, and it too names its source
    // rather than holding a copy under a generic name.
    expect(
      JSON.parse(
        readFileSync(
          path.join(
            packCardDir(DBS_CG_PACK_ID, {
              set: "bt1",
              lang: "en",
              card: "011-spr",
            }),
            "face.json",
          ),
          "utf8",
        ),
      ).art,
    ).toBe("art.deckplanet.webp");
    expect(
      existsSync(
        path.join(
          packCardDir(DBS_CG_PACK_ID, {
            set: "bt1",
            lang: "fr",
            card: "001",
          }),
          "art.webp",
        ),
      ),
    ).toBe(false);
    expect(
      readFileSync(path.join(leader, "art.deckplanet.webp")).length,
    ).toBeGreaterThan(12);
  });

  it("skips files it already ranged", async () => {
    const assets = path.join(tmp, "assets", "BT1");
    mkdirSync(assets, { recursive: true });
    writeFileSync(path.join(assets, "BT1-001.webp"), tinyWebp());
    await installArenaFaces({ assetsDir: path.join(tmp, "assets") });
    const again = await installArenaFaces({
      assetsDir: path.join(tmp, "assets"),
    });
    expect(again.ok).toBe(0);
    expect(again.skip).toBe(1);
  });
});
