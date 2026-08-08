/**
 * Malie.io TCGL bootstrap — catalogue / card-database inventory.
 *
 * Malie mirrors Live identity fields (`cardID`, `longFormID`) and CDN-shaped
 * image stems (`me1_fr_001_std.png` → bundle `me1_fr_001`). We pull their
 * processed databases to know *which* `{set}_{lang}_{num}` exist, then fetch
 * UnityFS bytes from the official Pokémon CDN.
 *
 * Credit: https://malie.io/static/ (nago) — please keep a shout-out if you ship
 * with this bootstrap.
 */

import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

import type { LiveCardIdentity } from "./cardDatabase";
import {
  isPokemonLiveLanguage,
  type PokemonLiveLanguage,
} from "./languages";

export const MALIE_CDN_BASE = "https://cdn.malie.io/file/malie-io/tcgl";
export const MALIE_DATABASES_INDEX_URL = `${MALIE_CDN_BASE}/databases/index.json`;
export const MALIE_EXPORT_INDEX_URL = `${MALIE_CDN_BASE}/export/index.json`;

/** Live file stem: ``card-database-bw10_0_fr_0.0``. */
export const MALIE_CARD_DATABASE_KEY_RE =
  /^card-database-([a-z0-9.-]+)_(\d+)_([a-z]{2,4})_/i;

/** CDN / Malie image stem without variant: ``me1_fr_001``. */
export const MALIE_BUNDLE_STEM_RE =
  /^([a-z0-9.-]+)_([a-z]{2,4})_(\d{3})(?:_[a-z]+)?$/i;

/** Live ``cardID``: ``bw10_1`` or ``bw10_1_ph``. */
export const MALIE_CARD_ID_RE =
  /^([a-z0-9.-]+)_(\d+)(?:_([a-z]+))?$/i;

export const LONG_FORM_ID_RE =
  /^([A-Za-z][A-Za-z0-9']*)_([a-z0-9.-]+)_(\d{1,3})_([a-z]+)_([A-Za-z0-9]+)_([A-Za-z0-9]+)_([A-Za-z0-9]+)$/;

/** Malie locale tag → Live CDN lang (skip es-419 / ``la`` until Live ships it). */
export const MALIE_LOCALE_TO_LIVE: Record<string, PokemonLiveLanguage | null> = {
  "en-US": "en",
  "fr-FR": "fr",
  "de-DE": "de",
  "it-IT": "it",
  "es-ES": "es",
  "pt-BR": "ptbr",
  "es-419": null,
  la: null,
};

export type MalieDatabaseIndexEntry = {
  data: string;
  revision?: string;
};

export type MalieDatabaseIndex = Record<string, MalieDatabaseIndexEntry>;

export type MalieCardDatabaseKey = {
  key: string;
  liveSet: string;
  tableIndex: number;
  lang: string;
};

export type MalieDbRow = Record<string, unknown>;

export type MalieDatabaseTable = {
  name?: string;
  layout?: Record<string, string>;
  rows: MalieDbRow[];
};

const DEFAULT_UA = "Placarr-malie-bootstrap/1.0 (+https://malie.io/static/)";

/** Line-buffered to the parent (admin log pipes are not a TTY). */
function defaultMalieProgress(line: string): void {
  writeSync(1, `${line}\n`);
}

export function liveLangFromMalieLocale(
  locale: string,
): PokemonLiveLanguage | null {
  if (isPokemonLiveLanguage(locale)) return locale;
  const mapped = MALIE_LOCALE_TO_LIVE[locale];
  if (mapped) return mapped;
  return null;
}

export function parseMalieCardDatabaseKey(
  key: string,
): MalieCardDatabaseKey | null {
  const m = MALIE_CARD_DATABASE_KEY_RE.exec(key.trim());
  if (!m) return null;
  const lang = m[3]!.toLowerCase();
  if (!isPokemonLiveLanguage(lang) && lang !== "la") return null;
  return {
    key,
    liveSet: m[1]!.toLowerCase(),
    tableIndex: Number.parseInt(m[2]!, 10),
    lang,
  };
}

/** ``bw10_1`` + ``fr`` → ``bw10_fr_001`` (CDN UnityFS name). */
export function bundleStemFromCardId(
  cardId: string,
  lang: string,
): string | null {
  const m = MALIE_CARD_ID_RE.exec(cardId.trim());
  if (!m) return null;
  const set = m[1]!.toLowerCase();
  const num = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(num)) return null;
  return `${set}_${lang.toLowerCase()}_${String(num).padStart(3, "0")}`;
}

/** ``…/me1_fr_001_std.png`` or ``me1_fr_001_ph.foil.png`` → ``me1_fr_001``. */
export function bundleStemFromMalieImagePath(imagePath: string): string | null {
  const base = imagePath.split("/").pop() ?? imagePath;
  const stem = base.replace(/\.(png|jpg|jpeg|webp)$/i, "");
  // drop .foil / variant suffixes after the num
  const m = /^([a-z0-9.-]+)_([a-z]{2,4})_(\d{3})/i.exec(stem);
  if (!m) return null;
  return `${m[1]!.toLowerCase()}_${m[2]!.toLowerCase()}_${m[3]}`;
}

export function identityFromMalieRow(
  row: MalieDbRow,
  lang: string,
): LiveCardIdentity | null {
  const longForm =
    typeof row.longFormID === "string" ? row.longFormID.trim() : "";
  const cardId = typeof row.cardID === "string" ? row.cardID.trim() : "";
  if (!longForm && !cardId) return null;

  let liveSet = "";
  let num = 0;
  let variant = "std";
  let rarity = "";
  let foil = "";
  let mask = "";
  let nameEn = "";

  const lf = LONG_FORM_ID_RE.exec(longForm);
  if (lf) {
    nameEn = lf[1]!;
    liveSet = lf[2]!.toLowerCase();
    num = Number.parseInt(lf[3]!, 10);
    variant = lf[4]!.toLowerCase();
    rarity = lf[5]!;
    foil = lf[6]!;
    mask = lf[7]!;
  } else {
    const cid = MALIE_CARD_ID_RE.exec(cardId);
    if (!cid) return null;
    liveSet = cid[1]!.toLowerCase();
    num = Number.parseInt(cid[2]!, 10);
    variant = (cid[3] ?? "std").toLowerCase();
  }

  const bundleStem = bundleStemFromCardId(
    cardId || `${liveSet}_${num}`,
    lang,
  );
  if (!bundleStem || !Number.isFinite(num)) return null;

  const foilEffect =
    typeof row["Foil Effect"] === "string" ? String(row["Foil Effect"]) : foil;
  const foilMask =
    typeof row["Foil Mask"] === "string" ? String(row["Foil Mask"]) : mask;
  const enName =
    typeof row["EN Card Name"] === "string"
      ? String(row["EN Card Name"])
      : nameEn;
  const frName =
    typeof row["FR Card Name"] === "string"
      ? String(row["FR Card Name"])
      : typeof row.LocalizedCardName === "string"
        ? String(row.LocalizedCardName)
        : "";
  const collector =
    typeof row["EN Card #"] === "string"
      ? String(row["EN Card #"])
      : typeof row["CompSea Card Number"] === "string"
        ? String(row["CompSea Card Number"])
        : String(num);
  const setCode =
    typeof row.setCode === "string"
      ? String(row.setCode)
      : liveSet.toUpperCase().replace(/-/g, "");

  return {
    bundle_stem: bundleStem,
    live_set: liveSet,
    num,
    lang: lang.toLowerCase(),
    variant,
    long_form_id: longForm || `${enName || "Card"}_${liveSet}_${num}_${variant}_Unknown_NonFoil_None`,
    card_id: cardId || `${liveSet}_${num}`,
    name_en: enName,
    name_fr: frName,
    collector_num: collector,
    foil_effect: foilEffect || "NonFoil",
    foil_mask: foilMask || "None",
    rarity_code: rarity || String(row["CompSea Rarity Code"] ?? ""),
    set_code: setCode,
  };
}

export function listMalieDatabaseKeysForLangs(
  index: MalieDatabaseIndex,
  langs: readonly string[],
): MalieCardDatabaseKey[] {
  const want = new Set(langs.map((l) => l.toLowerCase()));
  const out: MalieCardDatabaseKey[] = [];
  for (const key of Object.keys(index)) {
    const parsed = parseMalieCardDatabaseKey(key);
    if (!parsed) continue;
    if (!want.has(parsed.lang)) continue;
    if (!isPokemonLiveLanguage(parsed.lang)) continue;
    out.push(parsed);
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/** Encode Malie's modifier-letter colon in ``data`` filenames. */
export function malieDatabaseFileUrl(dataFile: string): string {
  const encoded = encodeURIComponent(dataFile).replace(/%2F/gi, "/");
  return `${MALIE_CDN_BASE}/databases/${encoded}`;
}

export async function fetchMalieDatabasesIndex(
  opts: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<MalieDatabaseIndex> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(MALIE_DATABASES_INDEX_URL, {
    headers: { "User-Agent": DEFAULT_UA },
    signal: opts.signal,
  });
  if (!res.ok) {
    throw new Error(`Malie databases index HTTP ${res.status}`);
  }
  return (await res.json()) as MalieDatabaseIndex;
}

export async function fetchMalieDatabaseTable(
  entry: MalieDatabaseIndexEntry,
  opts: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<MalieDatabaseTable> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = malieDatabaseFileUrl(entry.data);
  const res = await fetchImpl(url, {
    headers: { "User-Agent": DEFAULT_UA },
    signal: opts.signal,
  });
  if (!res.ok) {
    throw new Error(`Malie database HTTP ${res.status} ${url}`);
  }
  const json = (await res.json()) as MalieDatabaseTable;
  if (!Array.isArray(json.rows)) {
    throw new Error(`Malie database missing rows: ${entry.data}`);
  }
  return json;
}

export type MalieBootstrapReport = {
  langs: string[];
  databaseFiles: number;
  /** Fresh GETs from Malie CDN. */
  fetched: number;
  /** Local DB reused (same revision). */
  skipped: number;
  identities: number;
  bundleStems: number;
  setnums: number;
  outDir: string;
  cataloguePath: string;
  stemsPath: string;
};

export function malieRevisionsPath(dbDir: string): string {
  return path.join(dbDir, "revisions.json");
}

export function loadMalieRevisions(dbDir: string): Record<string, string> {
  const file = malieRevisionsPath(dbDir);
  if (!existsSync(file)) return {};
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

export function writeMalieRevisions(
  dbDir: string,
  revisions: Record<string, string>,
): void {
  mkdirSync(dbDir, { recursive: true });
  writeFileSync(
    malieRevisionsPath(dbDir),
    `${JSON.stringify(revisions, null, 2)}\n`,
    "utf8",
  );
}

/** Reuse local table when revision matches the Malie index (idempotent bootstrap). */
export function canReuseMalieDatabaseFile(opts: {
  destPath: string;
  key: string;
  indexRevision: string | undefined;
  localRevisions: Record<string, string>;
}): boolean {
  if (!existsSync(opts.destPath)) return false;
  try {
    if (statSync(opts.destPath).size <= 2) return false;
  } catch {
    return false;
  }
  const want = opts.indexRevision?.trim();
  if (!want) {
    // No revision in index → keep local if file parses.
    return true;
  }
  return opts.localRevisions[opts.key] === want;
}

export function malieDatabaseGzPath(dbDir: string, key: string): string {
  return path.join(dbDir, `${key}.json.gz`);
}

export function malieDatabasePlainPath(dbDir: string, key: string): string {
  return path.join(dbDir, `${key}.json`);
}

/** Prefer ``.json.gz``, fall back to legacy plain ``.json``. */
export function findMalieDatabaseOnDisk(
  dbDir: string,
  key: string,
): string | null {
  const gz = malieDatabaseGzPath(dbDir, key);
  try {
    if (existsSync(gz) && statSync(gz).size > 2) return gz;
  } catch {
    /* ignore */
  }
  const plain = malieDatabasePlainPath(dbDir, key);
  try {
    if (existsSync(plain) && statSync(plain).size > 2) return plain;
  } catch {
    /* ignore */
  }
  return null;
}

export function readMalieDatabaseTableFromDisk(
  destPath: string,
): MalieDatabaseTable | null {
  try {
    const raw = readFileSync(destPath);
    const text = destPath.endsWith(".gz")
      ? gunzipSync(raw).toString("utf8")
      : raw.toString("utf8");
    const json = JSON.parse(text) as MalieDatabaseTable;
    if (!Array.isArray(json.rows)) return null;
    return json;
  } catch {
    return null;
  }
}

/** Persist as gzip JSON; remove legacy plain ``.json`` sibling if present. */
export function writeMalieDatabaseTableToDisk(
  dbDir: string,
  key: string,
  table: MalieDatabaseTable,
): string {
  mkdirSync(dbDir, { recursive: true });
  const gzPath = malieDatabaseGzPath(dbDir, key);
  const payload = Buffer.from(`${JSON.stringify(table)}\n`, "utf8");
  writeFileSync(gzPath, gzipSync(payload, { level: 9 }));
  const plain = malieDatabasePlainPath(dbDir, key);
  if (existsSync(plain)) {
    try {
      unlinkSync(plain);
    } catch {
      /* ignore */
    }
  }
  return gzPath;
}

/**
 * One-shot: recompress every plain ``*.json`` under ``dbDir`` to ``*.json.gz``.
 * Skips ``revisions.json``. Returns counts for logging.
 */
export function compressMalieDatabasesDir(dbDir: string): {
  compressed: number;
  skipped: number;
  bytesBefore: number;
  bytesAfter: number;
} {
  let compressed = 0;
  let skipped = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;
  if (!existsSync(dbDir)) {
    return { compressed, skipped, bytesBefore, bytesAfter };
  }
  for (const name of readdirSync(dbDir)) {
    if (!name.endsWith(".json") || name.endsWith(".json.gz")) continue;
    if (name === "revisions.json") continue;
    const plain = path.join(dbDir, name);
    const key = name.slice(0, -".json".length);
    const table = readMalieDatabaseTableFromDisk(plain);
    if (!table) {
      skipped += 1;
      continue;
    }
    try {
      bytesBefore += statSync(plain).size;
    } catch {
      /* ignore */
    }
    const gz = writeMalieDatabaseTableToDisk(dbDir, key, table);
    try {
      bytesAfter += statSync(gz).size;
    } catch {
      /* ignore */
    }
    compressed += 1;
  }
  return { compressed, skipped, bytesBefore, bytesAfter };
}

/**
 * Download Malie card-database tables for ``langs``, write:
 * - ``malie-databases/*.json.gz`` (gzip tables; skip unchanged revisions)
 * - ``cdn-catalogue-setnum.txt`` (set_num lines)
 * - ``malie-bundle-stems.txt`` (exact CDN names to scrape from Rainier)
 *
 * Malie = inventory / catalogue. Pokémon CDN = UnityFS bytes for those stems.
 */
export async function bootstrapMalieCatalogue(opts: {
  outDir: string;
  langs: readonly string[];
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  /** Cap DB files (0 = no limit). */
  limitFiles?: number;
  /** When false, always re-fetch (default: reuse matching revisions). */
  skipExisting?: boolean;
  /** Progress logger (default: console.log). Pass ``null`` to silence. */
  onProgress?: ((line: string) => void) | null;
}): Promise<{
  report: MalieBootstrapReport;
  identities: LiveCardIdentity[];
  bundleStems: string[];
  setnums: string[];
}> {
  const outDir = opts.outDir;
  const dbDir = path.join(outDir, "malie-databases");
  mkdirSync(dbDir, { recursive: true });
  const skipExisting = opts.skipExisting !== false;
  const localRevisions = loadMalieRevisions(dbDir);
  const nextRevisions: Record<string, string> = { ...localRevisions };
  const log =
    opts.onProgress === null
      ? () => {}
      : (opts.onProgress ?? defaultMalieProgress);

  log("  Malie: fetching databases index…");
  const index = await fetchMalieDatabasesIndex({
    signal: opts.signal,
    fetchImpl: opts.fetchImpl,
  });
  let keys = listMalieDatabaseKeysForLangs(index, opts.langs);
  if (opts.limitFiles && opts.limitFiles > 0) {
    keys = keys.slice(0, opts.limitFiles);
  }
  log(
    `  Malie: ${keys.length} database files` +
      ` langs=${opts.langs.join(",")}` +
      (skipExisting ? " (skip unchanged revisions)" : " (force refetch)"),
  );

  // Migrate any leftover plain *.json → *.json.gz (one-shot, cheap vs re-fetch).
  const migrated = compressMalieDatabasesDir(dbDir);
  if (migrated.compressed > 0) {
    const beforeMb = (migrated.bytesBefore / (1024 * 1024)).toFixed(1);
    const afterMb = (migrated.bytesAfter / (1024 * 1024)).toFixed(1);
    log(
      `  Malie: gzip-migrated ${migrated.compressed} files` +
        ` ${beforeMb}MiB → ${afterMb}MiB`,
    );
  }

  const identities: LiveCardIdentity[] = [];
  const stemSet = new Set<string>();
  const setnumSet = new Set<string>();
  const seenLong = new Set<string>();
  let fetched = 0;
  let skipped = 0;
  const total = keys.length;
  const progressEvery = Math.max(1, Math.min(25, Math.floor(total / 20) || 1));

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!;
    if (opts.signal?.aborted) throw new Error("malie bootstrap cancelled");
    const entry = index[key.key];
    if (!entry?.data) continue;
    const existingPath = findMalieDatabaseOnDisk(dbDir, key.key);
    let table: MalieDatabaseTable | null = null;
    let action: "fetch" | "skip" | "reuse-fail" = "fetch";

    if (
      skipExisting &&
      existingPath &&
      canReuseMalieDatabaseFile({
        destPath: existingPath,
        key: key.key,
        indexRevision: entry.revision,
        localRevisions,
      })
    ) {
      table = readMalieDatabaseTableFromDisk(existingPath);
      if (table) {
        skipped += 1;
        action = "skip";
      } else {
        action = "reuse-fail";
      }
    }

    if (!table) {
      log(`  Malie [${i + 1}/${total}] fetch ${key.key}`);
      table = await fetchMalieDatabaseTable(entry, {
        signal: opts.signal,
        fetchImpl: opts.fetchImpl,
      });
      writeMalieDatabaseTableToDisk(dbDir, key.key, table);
      if (entry.revision?.trim()) {
        nextRevisions[key.key] = entry.revision.trim();
      }
      fetched += 1;
      action = "fetch";
    } else if (
      action === "skip" &&
      ((i + 1) % progressEvery === 0 || i + 1 === total)
    ) {
      log(
        `  Malie [${i + 1}/${total}] skip…` +
          ` (fetched=${fetched} skipped=${skipped})`,
      );
    }

    for (const row of table.rows) {
      const id = identityFromMalieRow(row, key.lang);
      if (!id) continue;
      if (seenLong.has(id.long_form_id)) continue;
      seenLong.add(id.long_form_id);
      identities.push(id);
      stemSet.add(id.bundle_stem);
      setnumSet.add(
        `${id.live_set}_${String(id.num).padStart(3, "0")}`,
      );
    }
  }

  writeMalieRevisions(dbDir, nextRevisions);

  const bundleStems = [...stemSet].sort();
  const setnums = [...setnumSet].sort();
  const cataloguePath = path.join(outDir, "cdn-catalogue-setnum.txt");
  const stemsPath = path.join(outDir, "malie-bundle-stems.txt");
  writeFileSync(cataloguePath, `${setnums.join("\n")}\n`, "utf8");
  writeFileSync(stemsPath, `${bundleStems.join("\n")}\n`, "utf8");

  const report: MalieBootstrapReport = {
    langs: [...opts.langs],
    databaseFiles: keys.length,
    fetched,
    skipped,
    identities: identities.length,
    bundleStems: bundleStems.length,
    setnums: setnums.length,
    outDir,
    cataloguePath,
    stemsPath,
  };
  writeFileSync(
    path.join(outDir, "malie-bootstrap-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  log(
    `  Malie done: fetched=${fetched} skipped=${skipped}` +
      ` identities=${identities.length} stems=${bundleStems.length}`,
  );

  return { report, identities, bundleStems, setnums };
}

/** Load stems written by a previous bootstrap (no network). */
export function loadMalieBundleStems(outDir: string): string[] {
  const stemsPath = path.join(outDir, "malie-bundle-stems.txt");
  if (!existsSync(stemsPath)) return [];
  return readFileSync(stemsPath, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

/** Keep only ``{set}_{lang}_{num}`` stems for the requested Live langs. */
export function filterMalieStemsByLangs(
  stems: readonly string[],
  langs: readonly string[],
): string[] {
  const want = new Set(
    langs.map((l) => l.trim().toLowerCase()).filter(Boolean),
  );
  if (want.size === 0) return [...stems];
  return stems.filter((stem) => {
    const m = /^[a-z0-9.-]+_([a-z]{2,4})_\d{3}/i.exec(stem.trim());
    return Boolean(m && want.has(m[1]!.toLowerCase()));
  });
}
