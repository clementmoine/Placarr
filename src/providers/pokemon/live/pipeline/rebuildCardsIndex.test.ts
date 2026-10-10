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

    const result = rebuildPokemonCardsIndex({ writeJson: true });
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

    const result = rebuildPokemonCardsIndex({ writeJson: true });
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
    const result = rebuildPokemonCardsIndex({ writeJson: true });
    expect(result.skipped).toBe(true);
    expect(result.cards).toBe(0);
    expect(result.named).toBe(0);
  });

  it("fills McDo / BSP gaps from prints.sqlite after live_cards", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "placarr-poke-tcgdex-"));
    process.env.PLACARR_DATA_DIR = tmp;

    const mcdo = path.join(tmp, "pokemon", "cards", "2011bw", "en", "001");
    const bsp = path.join(tmp, "pokemon", "cards", "bwbsp", "en", "029");
    mkdirSync(mcdo, { recursive: true });
    mkdirSync(bsp, { recursive: true });
    writeFileSync(path.join(mcdo, "art.webp"), "x");
    writeFileSync(path.join(bsp, "art.webp"), "x");

    const printsPath = path.join(tmp, "pokemon", "prints.sqlite");
    mkdirSync(path.dirname(printsPath), { recursive: true });
    const db = new DatabaseSync(printsPath);
    db.exec(`
      CREATE TABLE prints (
        print_key TEXT PRIMARY KEY,
        set_id TEXT NOT NULL,
        local_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        image_base_url TEXT
      );
      CREATE TABLE print_titles (
        print_key TEXT NOT NULL,
        lang TEXT NOT NULL,
        name TEXT NOT NULL,
        set_name TEXT,
        serie_name TEXT,
        PRIMARY KEY (print_key, lang)
      );
    `);
    db.prepare(
      `INSERT INTO prints (print_key, set_id, local_id, provider_id, image_base_url)
       VALUES (?, ?, ?, ?, NULL)`,
    ).run("2011bw-1", "2011bw", "1", "tcgdex");
    db.prepare(
      `INSERT INTO print_titles (print_key, lang, name, set_name, serie_name)
       VALUES (?, ?, ?, NULL, NULL)`,
    ).run("2011bw-1", "en", "Snivy");
    db.prepare(
      `INSERT INTO prints (print_key, set_id, local_id, provider_id, image_base_url)
       VALUES (?, ?, ?, ?, NULL)`,
    ).run("bwp-BW29", "bwp", "BW29", "tcgdex");
    db.prepare(
      `INSERT INTO print_titles (print_key, lang, name, set_name, serie_name)
       VALUES (?, ?, ?, NULL, NULL)`,
    ).run("bwp-BW29", "en", "Reshiram");
    db.close();

    const result = rebuildPokemonCardsIndex({ writeJson: true });
    expect(result.cards).toBe(2);
    expect(result.named).toBe(2);
    const raw = JSON.parse(readFileSync(result.path, "utf8")) as {
      cards: Record<
        string,
        { langs: Record<string, { name?: string; nameSource?: string }> }
      >;
    };
    expect(raw.cards["2011bw_en_001"]?.langs.en?.name).toBe("Snivy");
    expect(raw.cards["2011bw_en_001"]?.langs.en?.nameSource).toBe("tcgdex");
    expect(raw.cards.bwbsp_en_029?.langs.en?.name).toBe("Reshiram");
    expect(raw.cards.bwbsp_en_029?.langs.en?.nameSource).toBe("tcgdex");
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

    const dbPath = path.join(tmp, "pokemon", "live.sqlite");
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

    const result = rebuildPokemonCardsIndex({ writeJson: true });
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

  it("joins alt-folder stems via bundle set+num (svalt → sv1 identity)", () => {
    const lookup = loadPokemonLiveNameLookup(
      (() => {
        const tmp = mkdtempSync(path.join(os.tmpdir(), "placarr-poke-alt-"));
        const dbPath = path.join(tmp, "live.sqlite");
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
        db.prepare(
          `INSERT INTO live_cards
           (bundle_stem, live_set, num, lang, variant, long_form_id, name_en, name_fr)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          "svalt_de_001",
          "sv1",
          13,
          "de",
          "alt",
          "sprigatito_svalt_1_de",
          "Sprigatito",
          "Felori",
        );
        db.close();
        return dbPath;
      })(),
    );
    expect(resolvePokemonIndexName("svalt_en_001", lookup)).toEqual({
      kind: "attested",
      name: "Sprigatito",
    });
    expect(resolvePokemonIndexName("svalt_fr_001", lookup)).toEqual({
      kind: "fallback",
      name: "Sprigatito",
      catalogue: "show",
      from: "en",
    });
    expect(resolvePokemonIndexName("svalt_de_001", lookup)).toEqual({
      kind: "attested",
      name: "Felori",
    });
  });

  it("loadPokemonLiveNameLookup is empty when sqlite is missing", () => {
    const lookup = loadPokemonLiveNameLookup(
      path.join(os.tmpdir(), "placarr-no-such-live.sqlite"),
    );
    expect(lookup.byStem.size).toBe(0);
  });
});
