import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import {
  extractIdentitiesFromBlob,
  extractIdentitiesFromFile,
  liveFoilMaskOverrideMap,
  writeLiveCardsSqlite,
  writeLiveFoilMasksJson,
} from "./cardDatabase";

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function lp(text: string): Buffer {
  const raw = Buffer.from(text, "utf8");
  if (raw.length >= 128) throw new Error("lp string too long");
  return Buffer.concat([Buffer.from([raw.length]), raw]);
}

function makeBlob(opts: {
  nameEn: string;
  nameFr: string;
  collector: string;
  longForm: string;
  extraSearch: string;
}): Buffer {
  return Buffer.concat([
    Buffer.from("HDR"),
    lp(""),
    lp(opts.nameEn),
    lp(""),
    lp(opts.nameFr),
    lp(""),
    lp(opts.collector),
    lp(""),
    lp(opts.longForm),
    lp(""),
    lp("198"),
    lp(""),
    lp(opts.extraSearch),
    lp(""),
    lp(opts.nameFr),
    lp(""),
    lp("Collision"),
    Buffer.from("TAIL"),
  ]);
}

describe("cardDatabase", () => {
  it("extractIdentitiesFromBlob on synthetic neighbourhood", () => {
    const blob = makeBlob({
      nameEn: "Flittle",
      nameFr: "Flotillon",
      collector: "100",
      longForm: "Flittle_sv1_100_std_Common_NonFoil_None",
      extraSearch: "flotillon collision",
    });
    const rows = extractIdentitiesFromBlob(blob, { lang: "fr" });
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.bundle_stem).toBe("sv1_fr_100");
    expect(row.live_set).toBe("sv1");
    expect(row.num).toBe(100);
    expect(row.variant).toBe("std");
    expect(row.name_en).toBe("Flittle");
    expect(row.name_fr).toBe("Flotillon");
    expect(row.collector_num).toBe("100");
    expect(row.foil_effect).toBe("NonFoil");
    expect(row.foil_mask).toBe("None");
    expect(row.rarity_code).toBe("Common");
  });

  it("extractIdentitiesFromFile on wrapped JSON", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "card-db-"));
    tmpDirs.push(dir);
    const blob = makeBlob({
      nameEn: "Pineco",
      nameFr: "Pomdepik",
      collector: "1",
      longForm: "Pineco_sv1_1_std_Common_NonFoil_None",
      extraSearch: "pomdepik pression",
    });
    const payload = {
      id: "card-database-sv1_1_fr_0.0",
      keys: {
        table: { contentBinary: blob.toString("base64") },
      },
    };
    const filePath = path.join(dir, "card-database-sv1_1_fr_0.0.json");
    fs.writeFileSync(filePath, JSON.stringify(payload), "utf8");
    const rows = extractIdentitiesFromFile(filePath);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.bundle_stem).toBe("sv1_fr_001");
    expect(rows[0]!.name_fr).toBe("Pomdepik");
    expect(rows[0]!.lang).toBe("fr");
  });

  it("writeLiveCardsSqlite", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "card-db-"));
    tmpDirs.push(dir);
    const blob = makeBlob({
      nameEn: "Pineco",
      nameFr: "Pomdepik",
      collector: "1",
      longForm: "Pineco_sv1_1_ph_Common_FlatSilver_Reverse",
      extraSearch: "pomdepik",
    });
    const rows = extractIdentitiesFromBlob(blob, { lang: "fr" });
    const dest = path.join(dir, "live-cards.sqlite");
    const meta = writeLiveCardsSqlite(rows, dest);
    expect(meta.rows).toBe(1);
    expect(fs.existsSync(dest)).toBe(true);

    const db = new DatabaseSync(dest, { readOnly: true });
    try {
      const hit = db
        .prepare(
          "SELECT bundle_stem, name_fr, variant FROM live_cards WHERE name_en=?",
        )
        .get("Pineco") as
        | { bundle_stem: string; name_fr: string; variant: string }
        | undefined;
      expect(hit?.bundle_stem).toBe("sv1_fr_001");
      expect(hit?.name_fr).toBe("Pomdepik");
      expect(hit?.variant).toBe("ph");
    } finally {
      db.close();
    }
  });

  it("liveFoilMaskOverrideMap / writeLiveFoilMasksJson", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "foil-masks-"));
    tmpDirs.push(dir);
    const rows = [
      {
        bundle_stem: "me5_fr_045",
        live_set: "me5",
        num: 45,
        lang: "fr",
        variant: "std",
        long_form_id: "x_CastAndCure",
        card_id: "",
        name_en: "",
        name_fr: "",
        collector_num: "45",
        foil_effect: "SunPillar",
        foil_mask: "CastAndCure",
        rarity_code: "",
        set_code: "",
      },
      {
        bundle_stem: "sv1_fr_001",
        live_set: "sv1",
        num: 1,
        lang: "fr",
        variant: "ph",
        long_form_id: "y_Reverse",
        card_id: "",
        name_en: "",
        name_fr: "",
        collector_num: "1",
        foil_effect: "FlatSilver",
        foil_mask: "Reverse",
        rarity_code: "",
        set_code: "",
      },
    ];
    expect(liveFoilMaskOverrideMap(rows)).toEqual({
      "me5_fr_045::std": "CastAndCure",
    });
    const dest = path.join(dir, "liveFoilMasks.json");
    expect(writeLiveFoilMasksJson(rows, dest).entries).toBe(1);
    expect(JSON.parse(fs.readFileSync(dest, "utf8"))).toEqual({
      "me5_fr_045::std": "CastAndCure",
    });
  });
});
