import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  lookupByBundle,
  lookupByName,
  lookupBySetNum,
  resetLiveCardsIndexCache,
} from "./liveCardsIndex";

const tmpDirs: string[] = [];

afterEach(async () => {
  resetLiveCardsIndexCache();
  await Promise.all(
    tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function makeDb(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "live-cards-"));
  tmpDirs.push(dir);
  const dbPath = path.join(dir, "live-cards.sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE live_cards (
      bundle_stem TEXT NOT NULL,
      live_set TEXT NOT NULL,
      num INTEGER NOT NULL,
      lang TEXT NOT NULL,
      variant TEXT NOT NULL,
      long_form_id TEXT NOT NULL PRIMARY KEY,
      card_id TEXT,
      name_en TEXT,
      name_fr TEXT,
      collector_num TEXT,
      foil_effect TEXT,
      foil_mask TEXT,
      rarity_code TEXT,
      set_code TEXT
    );
  `);
  db.prepare(
    `INSERT INTO live_cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    "sv1_fr_001",
    "sv1",
    1,
    "fr",
    "std",
    "Pineco_sv1_1_std_Common_NonFoil_None",
    "sv1_1",
    "Pineco",
    "Pomdepik",
    "1",
    "NonFoil",
    "None",
    "Common",
    "SV1",
  );
  db.prepare(
    `INSERT INTO live_cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    "sv1_fr_100",
    "sv1",
    100,
    "fr",
    "std",
    "Flittle_sv1_100_std_Common_NonFoil_None",
    "sv1_100",
    "Flittle",
    "Flotillon",
    "100",
    "NonFoil",
    "None",
    "Common",
    "SV1",
  );
  db.close();
  return dbPath;
}

describe("liveCardsIndex", () => {
  it("looks up by bundle / set+num / name", async () => {
    const dbPath = await makeDb();
    expect(lookupByBundle("sv1_fr_001", { dbPath })?.nameFr).toBe("Pomdepik");
    expect(lookupBySetNum("sv1", 100, { dbPath })?.nameEn).toBe("Flittle");
    expect(lookupByName(["sv1"], "Flotillon", { dbPath })?.bundleStem).toBe(
      "sv1_fr_100",
    );
    expect(lookupByName(["sv1"], "flotillon", { dbPath })?.nameEn).toBe(
      "Flittle",
    );
  });

  it("returns null when the sqlite is missing", () => {
    expect(
      lookupByBundle("sv1_fr_001", {
        dbPath: path.join(os.tmpdir(), "no-such-live-cards.sqlite"),
      }),
    ).toBeNull();
  });
});
