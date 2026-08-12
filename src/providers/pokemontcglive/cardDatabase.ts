/**
 * Decode TCG Live `card-database-*.json` identity rows.
 *
 * The `contentBinary` blob is a typed table. Identity fields sit next to each
 * `longFormID` as length-prefixed UTF-8 strings.
 */

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const LONG_FORM_RE =
  /([A-Za-z][A-Za-z0-9']*)_([a-z0-9.-]+)_(\d{1,3})_([a-z]+)_([A-Za-z0-9]+)_([A-Za-z0-9]+)_([A-Za-z0-9]+)/g;

const CARD_DATABASE_STEM_RE =
  /^card-database-([a-z0-9.-]+)_\d+_([a-z]{2,4})_/i;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS live_cards (
  bundle_stem TEXT NOT NULL,
  live_set TEXT NOT NULL,
  num INTEGER NOT NULL,
  lang TEXT NOT NULL,
  variant TEXT NOT NULL,
  long_form_id TEXT NOT NULL,
  card_id TEXT,
  name_en TEXT,
  name_fr TEXT,
  collector_num TEXT,
  foil_effect TEXT,
  foil_mask TEXT,
  rarity_code TEXT,
  set_code TEXT,
  PRIMARY KEY (long_form_id)
);
CREATE INDEX IF NOT EXISTS idx_live_bundle ON live_cards(bundle_stem);
CREATE INDEX IF NOT EXISTS idx_live_set_num ON live_cards(live_set, num);
CREATE INDEX IF NOT EXISTS idx_live_name_en ON live_cards(name_en);
CREATE INDEX IF NOT EXISTS idx_live_name_fr ON live_cards(name_fr);
`;

export type LiveCardIdentity = {
  bundle_stem: string;
  live_set: string;
  num: number;
  lang: string;
  variant: string;
  long_form_id: string;
  card_id: string;
  name_en: string;
  name_fr: string;
  collector_num: string;
  foil_effect: string;
  foil_mask: string;
  rarity_code: string;
  set_code: string;
};

export function decodeContentBinary(raw: unknown): Buffer | null {
  const stack: unknown[] = [raw];
  while (stack.length) {
    const obj = stack.pop();
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const rec = obj as Record<string, unknown>;
      const cb = rec.contentBinary;
      if (typeof cb === "string") {
        try {
          return Buffer.from(cb, "base64");
        } catch {
          return null;
        }
      }
      stack.push(...Object.values(rec));
    } else if (Array.isArray(obj)) {
      stack.push(...obj);
    }
  }
  return null;
}

function lpStringAt(
  blob: Buffer,
  i: number,
): { text: string; end: number } | null {
  if (i < 0 || i >= blob.length) return null;
  const n = blob[i]!;
  if (n >= 128) return null;
  const start = i + 1;
  const end = start + n;
  if (end > blob.length) return null;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      blob.subarray(start, end),
    );
    return { text, end };
  } catch {
    return null;
  }
}

function stringsBefore(blob: Buffer, end: number, limit = 8): string[] {
  const out: string[] = [];
  let cursor = end;
  for (let n = 0; n < limit; n++) {
    let found = false;
    for (let length = 0; length < 120; length++) {
      const start = cursor - 1 - length;
      if (start < 0) break;
      if (blob[start] !== length) continue;
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(
          blob.subarray(start + 1, cursor),
        );
        out.push(text);
        cursor = start;
        found = true;
        break;
      } catch {
        continue;
      }
    }
    if (!found) break;
  }
  return out;
}

function stringsAfter(blob: Buffer, start: number, limit = 6): string[] {
  const out: string[] = [];
  let i = start;
  for (let n = 0; n < limit; n++) {
    const parsed = lpStringAt(blob, i);
    if (!parsed) break;
    out.push(parsed.text);
    i = parsed.end;
  }
  return out;
}

export function langFromCardDatabasePath(filePath: string): string | null {
  const m = CARD_DATABASE_STEM_RE.exec(path.basename(filePath));
  return m ? m[2]!.toLowerCase() : null;
}

export function liveSetFromCardDatabasePath(filePath: string): string | null {
  const m = CARD_DATABASE_STEM_RE.exec(path.basename(filePath));
  return m ? m[1]!.toLowerCase() : null;
}

/** Find ASCII longForm matches in a binary blob (mirrors Python bytes regex). */
function findLongForms(
  blob: Buffer,
): Array<{
  index: number;
  length: number;
  en: string;
  set: string;
  num: string;
  variant: string;
  rarity: string;
  foil: string;
  mask: string;
  longForm: string;
}> {
  const text = blob.toString("latin1");
  const out: Array<{
    index: number;
    length: number;
    en: string;
    set: string;
    num: string;
    variant: string;
    rarity: string;
    foil: string;
    mask: string;
    longForm: string;
  }> = [];
  LONG_FORM_RE.lastIndex = 0;
  for (const m of text.matchAll(LONG_FORM_RE)) {
    out.push({
      index: m.index!,
      length: m[0].length,
      en: m[1]!,
      set: m[2]!,
      num: m[3]!,
      variant: m[4]!,
      rarity: m[5]!,
      foil: m[6]!,
      mask: m[7]!,
      longForm: m[0],
    });
  }
  return out;
}

export function extractIdentitiesFromBlob(
  blob: Buffer,
  opts: { lang: string; liveSetHint?: string | null },
): LiveCardIdentity[] {
  const rows: LiveCardIdentity[] = [];
  const seen = new Set<string>();
  for (const m of findLongForms(blob)) {
    if (seen.has(m.longForm)) continue;
    seen.add(m.longForm);

    let nameEn = m.en;
    const liveSet = m.set.toLowerCase();
    const num = Number.parseInt(m.num, 10);
    const variant = m.variant.toLowerCase();
    const rarity = m.rarity;
    const foil = m.foil;
    const mask = m.mask;

    void opts.liveSetHint; // parity with Python (mismatch kept)

    const before = stringsBefore(blob, m.index - 1, 8);
    const nonemptyBefore = before.filter((s) => s);
    let collector = "";
    let localized = "";
    if (nonemptyBefore.length) collector = nonemptyBefore[0]!;
    if (nonemptyBefore.length >= 2) localized = nonemptyBefore[1]!;
    if (nonemptyBefore.length >= 3 && nonemptyBefore[2]) {
      nameEn = nonemptyBefore[2]!;
    }

    const after = stringsAfter(blob, m.index + m.length, 6);
    const nonemptyAfter = after.filter((s) => s);
    let nameFr = localized;
    if (nonemptyAfter.length >= 3) {
      nameFr = nonemptyAfter[2] || localized;
    } else if (localized) {
      nameFr = localized;
    }

    const lang = opts.lang;
    const bundleStem = `${liveSet}_${lang}_${String(num).padStart(3, "0")}`;
    const cardId = `${liveSet}_${num}`;
    const setCode = liveSet.toUpperCase().replace(/-/g, "");

    rows.push({
      bundle_stem: bundleStem,
      live_set: liveSet,
      num,
      lang,
      variant,
      long_form_id: m.longForm,
      card_id: cardId,
      name_en: nameEn,
      name_fr: nameFr,
      collector_num: collector || String(num),
      foil_effect: foil,
      foil_mask: mask,
      rarity_code: rarity,
      set_code: setCode,
    });
  }
  return rows;
}

export function extractIdentitiesFromFile(
  filePath: string,
): LiveCardIdentity[] {
  const lang = langFromCardDatabasePath(filePath);
  if (!lang) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return [];
  }
  const blob = decodeContentBinary(raw);
  if (!blob) return [];
  return extractIdentitiesFromBlob(blob, {
    lang,
    liveSetHint: liveSetFromCardDatabasePath(filePath),
  });
}

export function collectIdentitiesFromConfigCache(
  configCache: string,
): LiveCardIdentity[] {
  const rows: LiveCardIdentity[] = [];
  const seen = new Set<string>();
  const files = fs
    .readdirSync(configCache)
    .filter((n) => n.startsWith("card-database-") && n.endsWith(".json"))
    .sort();
  for (const name of files) {
    for (const row of extractIdentitiesFromFile(path.join(configCache, name))) {
      if (seen.has(row.long_form_id)) continue;
      seen.add(row.long_form_id);
      rows.push(row);
    }
  }
  return rows;
}

/**
 * Foil masks that change WebGL uniforms / CC plates (client-safe JSON slice).
 * Everything else stays at MAT sheet defaults.
 */
const CLIENT_FOIL_MASK_OVERRIDES = new Set([
  "CastAndCure",
  "ReverseLaminatePokeBall",
  "ReverseLaminateMasterBall",
]);

/**
 * `bundle_stem::variant` → foil_mask for CastAndCure / laminate CC plates.
 *
 * Stem alone is not unique: the same art bundle carries std / ph / sph / mph
 * rows with different masks (Reverse vs Poké Ball vs Master Ball laminate).
 */
export function liveFoilMaskOverrideMap(
  rows: readonly LiveCardIdentity[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    if (!CLIENT_FOIL_MASK_OVERRIDES.has(row.foil_mask)) continue;
    const variant = (row.variant || "std").trim().toLowerCase() || "std";
    const stem = row.bundle_stem.trim().toLowerCase();
    if (!stem) continue;
    out[`${stem}::${variant}`] = row.foil_mask;
  }
  return out;
}

/** Write `data/pokemon/liveFoilMasks.json` for the browser foil pack. */
export function writeLiveFoilMasksJson(
  rows: readonly LiveCardIdentity[],
  dest: string,
): { path: string; entries: number } {
  const map = liveFoilMaskOverrideMap(rows);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(
    dest,
    `${JSON.stringify(map, null, 0)}\n`,
    "utf8",
  );
  return { path: dest, entries: Object.keys(map).length };
}

export function writeLiveCardsSqlite(
  rows: LiveCardIdentity[],
  dest: string,
): { path: string; rows: number; bundles: number; sets: number } {
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  type CardFoilRow = Record<string, string | number | null>;
  let preservedFoil: CardFoilRow[] = [];
  if (fs.existsSync(dest)) {
    try {
      const prev = new DatabaseSync(dest, { readOnly: true });
      try {
        const has = prev
          .prepare(
            `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='card_foil'`,
          )
          .get() as { ok?: number } | undefined;
        if (has?.ok) {
          preservedFoil = prev
            .prepare(`SELECT * FROM card_foil`)
            .all() as CardFoilRow[];
        }
      } finally {
        prev.close();
      }
    } catch {
      preservedFoil = [];
    }
  }

  // Build on a sibling path, then rename over `dest`. Next/admin may keep a
  // read-only handle on the live file during extract; in-place rewrite (unlink
  // + recreate + per-row commits) races SHARED locks → SQLITE_BUSY. Atomic
  // replace leaves readers on the old inode and never writes through their path.
  const tmp = `${dest}.tmp`;
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* no prior tmp */
  }

  const db = new DatabaseSync(tmp);
  try {
    db.exec("PRAGMA busy_timeout = 30000");
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(SCHEMA_SQL);
      const insert = db.prepare(`
        INSERT INTO live_cards (
          bundle_stem, live_set, num, lang, variant, long_form_id,
          card_id, name_en, name_fr, collector_num,
          foil_effect, foil_mask, rarity_code, set_code
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?
        )
      `);
      for (const row of rows) {
        insert.run(
          row.bundle_stem,
          row.live_set,
          row.num,
          row.lang,
          row.variant,
          row.long_form_id,
          row.card_id,
          row.name_en,
          row.name_fr,
          row.collector_num,
          row.foil_effect,
          row.foil_mask,
          row.rarity_code,
          row.set_code,
        );
      }

      if (preservedFoil.length > 0) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS card_foil (
            bundle_id TEXT NOT NULL,
            variant TEXT NOT NULL,
            card_tex TEXT,
            mask_tex TEXT,
            etch_tex TEXT,
            cold_foil_tex TEXT,
            foil TEXT,
            shader TEXT,
            PRIMARY KEY (bundle_id, variant)
          );
          CREATE INDEX IF NOT EXISTS card_foil_shader ON card_foil (shader);
        `);
        const foilInsert = db.prepare(
          `INSERT OR REPLACE INTO card_foil
            (bundle_id, variant, card_tex, mask_tex, etch_tex, cold_foil_tex, foil, shader)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const r of preservedFoil) {
          foilInsert.run(
            r.bundle_id,
            r.variant,
            r.card_tex ?? null,
            r.mask_tex ?? null,
            r.etch_tex ?? null,
            r.cold_foil_tex ?? null,
            r.foil ?? null,
            r.shader ?? null,
          );
        }
      }
      db.exec("COMMIT");
    } catch (err) {
      try {
        db.exec("ROLLBACK");
      } catch {
        /* already closed / no txn */
      }
      throw err;
    }
  } finally {
    db.close();
  }

  fs.renameSync(tmp, dest);
  return {
    path: dest,
    rows: rows.length,
    bundles: new Set(rows.map((r) => r.bundle_stem)).size,
    sets: new Set(rows.map((r) => r.live_set)).size,
  };
}
