import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import {
  ensurePokemonDbLayout,
  pokemonIdentityDbPath,
  pokemonLegacyPrintsDbPath,
  pokemonLiveDbPath,
} from "./paths";

describe("ensurePokemonDbLayout", () => {
  const prev = process.env.PLACARR_DATA_DIR;
  let tmp = "";

  afterEach(() => {
    if (prev === undefined) delete process.env.PLACARR_DATA_DIR;
    else process.env.PLACARR_DATA_DIR = prev;
  });

  it("moves Live dump off catalog.sqlite and prints.sqlite onto catalog.sqlite", () => {
    tmp = path.join(
      os.tmpdir(),
      `placarr-poke-db-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    process.env.PLACARR_DATA_DIR = tmp;
    const pack = path.join(tmp, "pokemon");
    mkdirSync(pack, { recursive: true });

    const oldLive = path.join(pack, "catalog.sqlite");
    const liveDb = new DatabaseSync(oldLive);
    liveDb.exec(`CREATE TABLE live_cards (bundle_stem TEXT)`);
    liveDb.close();

    const prints = path.join(pack, "prints.sqlite");
    const printsDb = new DatabaseSync(prints);
    printsDb.exec(`CREATE TABLE prints (print_key TEXT)`);
    printsDb.close();

    ensurePokemonDbLayout();

    expect(existsSync(pokemonLiveDbPath())).toBe(true);
    expect(existsSync(pokemonIdentityDbPath())).toBe(true);
    expect(existsSync(pokemonLegacyPrintsDbPath())).toBe(false);

    const live = new DatabaseSync(pokemonLiveDbPath(), { readOnly: true });
    expect(
      live
        .prepare(
          `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='live_cards'`,
        )
        .get(),
    ).toBeTruthy();
    live.close();

    const identity = new DatabaseSync(pokemonIdentityDbPath(), {
      readOnly: true,
    });
    expect(
      identity
        .prepare(
          `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='prints'`,
        )
        .get(),
    ).toBeTruthy();
    expect(
      identity
        .prepare(
          `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='live_cards'`,
        )
        .get(),
    ).toBeFalsy();
    identity.close();
  });
});
