import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import {
  rebuildPokemonCardsIndex,
  resolvePokemonIndexName,
  loadPokemonLiveNameLookup,
} from "./rebuildCardsIndex";

describe("rebuildPokemonCardsIndex", () => {
  const originalData = process.env.PLACARR_DATA_DIR;

  afterEach(() => {
    if (originalData === undefined) delete process.env.PLACARR_DATA_DIR;
    else process.env.PLACARR_DATA_DIR = originalData;
  });

  it("walks cards/ into CardsIndexV1 stems", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "placarr-poke-index-"));
    process.env.PLACARR_DATA_DIR = tmp;
    const cardDir = path.join(tmp, "pokemon", "cards", "me5", "fr", "045");
    mkdirSync(cardDir, { recursive: true });
    writeFileSync(path.join(cardDir, "art.webp"), "x");
    writeFileSync(path.join(cardDir, "mask.webp"), "x");
    writeFileSync(path.join(cardDir, "mask-ph.webp"), "x");

    const result = rebuildPokemonCardsIndex();
    expect(result.skipped).toBe(false);
    expect(result.cards).toBe(1);
    expect(result.named).toBe(0);

    const raw = JSON.parse(readFileSync(result.path, "utf8")) as {
      version: number;
      pack: string;
      cards: Record<
        string,
        { langs: Record<string, { art?: string; variants?: unknown }> }
      >;
    };
    expect(raw.version).toBe(1);
    expect(raw.pack).toBe("pokemon");
    expect(raw.cards.me5_fr_045?.langs.fr?.art).toBe("art.webp");
    expect(raw.cards.me5_fr_045?.langs.fr?.variants).toEqual({
      ph: { mask: "mask-ph.webp" },
    });
  });

  it("prefers live art.webp over art.coleka in the index", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "placarr-poke-index-mc-"));
    process.env.PLACARR_DATA_DIR = tmp;
    const cardDir = path.join(tmp, "pokemon", "cards", "2023sv", "fr", "004");
    mkdirSync(cardDir, { recursive: true });
    writeFileSync(path.join(cardDir, "art.coleka.webp"), "coleka");
    writeFileSync(path.join(cardDir, "art.webp"), "live");

    const result = rebuildPokemonCardsIndex();
    expect(result.cards).toBe(1);
    const raw = JSON.parse(readFileSync(result.path, "utf8")) as {
      cards: Record<string, { langs: Record<string, { art?: string }> }>;
    };
    expect(raw.cards["2023sv_fr_004"]?.langs.fr?.art).toBe("art.webp");
  });

  it("soft-skips when cards/ is missing", () => {
    const tmp = mkdtempSync(
      path.join(os.tmpdir(), "placarr-poke-index-empty-"),
    );
    process.env.PLACARR_DATA_DIR = tmp;
    const result = rebuildPokemonCardsIndex();
    expect(result.skipped).toBe(true);
    expect(result.cards).toBe(0);
    expect(result.named).toBe(0);
  });

  it("joins live_cards titles onto matching stems (and EN fallback)", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "placarr-poke-index-names-"));
    process.env.PLACARR_DATA_DIR = tmp;

    const frDir = path.join(tmp, "pokemon", "cards", "sv1", "fr", "019");
    const enDir = path.join(tmp, "pokemon", "cards", "sv1", "en", "019");
    mkdirSync(frDir, { recursive: true });
    mkdirSync(enDir, { recursive: true });
    writeFileSync(path.join(frDir, "art.webp"), "fr");
    writeFileSync(path.join(enDir, "art.webp"), "en");

    const dbPath = path.join(tmp, "pokemon", "catalog.sqlite");
    mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE live_cards (
        bundle_stem TEXT NOT NULL,
        live_set TEXT NOT NULL,
        num INTEGER NOT NULL,
        lang TEXT NOT NULL,
        variant TEXT NOT NULL,
        long_form_id TEXT NOT NULL PRIMARY KEY,
        name_en TEXT,
        name_fr TEXT
      );
    `);
    // Only a DE identity row — FR/EN tiles still get titles via set+num.
    db.prepare(
      `INSERT INTO live_cards
       (bundle_stem, live_set, num, lang, variant, long_form_id, name_en, name_fr)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "sv1_de_019",
      "sv1",
      19,
      "de",
      "std",
      "spidops_sv1_19_de",
      "Spidops ex",
      "Spidops-ex",
    );
    db.close();

    const result = rebuildPokemonCardsIndex();
    expect(result.cards).toBe(2);
    expect(result.named).toBe(2);

    const raw = JSON.parse(readFileSync(result.path, "utf8")) as {
      cards: Record<
        string,
        {
          name?: string;
          langs: Record<string, { name?: string; nameSource?: string }>;
        }
      >;
    };
    expect(raw.cards.sv1_fr_019?.langs.fr?.name).toBe("Spidops ex");
    expect(raw.cards.sv1_fr_019?.langs.fr?.nameSource).toBe("en");
    expect(raw.cards.sv1_en_019?.langs.en?.name).toBe("Spidops ex");
    expect(raw.cards.sv1_en_019?.langs.en?.nameSource).toBeUndefined();
  });
});

describe("resolvePokemonIndexName", () => {
  it("prefers the locale row when present", () => {
    const lookup = {
      byStem: new Map([
        [
          "sv1_fr_019",
          {
            bundleStem: "sv1_fr_019",
            liveSet: "sv1",
            num: 19,
            lang: "fr",
            nameEn: "Spidops ex",
            nameLocalized: "Filentrappe-ex",
          },
        ],
      ]),
      bySetNum: new Map(),
    };
    expect(resolvePokemonIndexName("sv1_fr_019", lookup)).toEqual({
      kind: "attested",
      name: "Filentrappe-ex",
    });
  });

  it("loadPokemonLiveNameLookup is empty when sqlite is missing", () => {
    const lookup = loadPokemonLiveNameLookup(
      path.join(os.tmpdir(), "placarr-no-such-catalog.sqlite"),
    );
    expect(lookup.byStem.size).toBe(0);
  });
});
