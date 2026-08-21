/**
 * Map Wayback / carddass.fr card image paths to Placarr print identity.
 * Pure — no I/O.
 *
 * Pack / game umbrella = `naruto`. Set = series only (`s1`…`s6`, `promo`, `ns`).
 * Locale is a disk/title axis under `cards/{set}/{fr|en|jap}/{cardId}/`, not
 * part of the set code or printKey.
 */

import { buildPrintKey } from "@/core/identify/printKey";

import { narutoDumpFaceRank } from "./faceChoice";

/** Pack + printKey game slug — all Naruto TCG locales. */
export const NARUTO_GAME = "naruto";

/** On-disk / title locales for the shared series tree. */
export const NARUTO_LANG_FR = "fr";
export const NARUTO_LANG_EN = "en";
export const NARUTO_LANG_JAP = "jap";

/** @deprecated Use {@link NARUTO_GAME} — kept for one release of grep/migrate. */
export const NARUTO_CCG_GAME = NARUTO_GAME;

export type CarddassCardType = "ni" | "te" | "ta" | "cl";

export type ParsedCarddassAsset = {
  /** Set code: `s1`…`s6`, `promo`, or `ns` */
  set: string;
  type: CarddassCardType;
  /** Collector number digits as on file, zero-padded preserved when present */
  numberDigits: string;
  /** e.g. ni023 */
  number: string;
  /** promo grouping when applicable (e.g. cdf) */
  grouping: string | null;
  /**
   * `art` = as published on carddass.fr;
   * `corrected` = `-vc` (version corrigée / errata text) — prefer when serving.
   */
  role: "art" | "corrected";
  printKey: string;
  /** Disk card id under cards/{set}/{lang}/{cardId}/ */
  cardId: string;
};

const TYPE_FROM_PREFIX: Record<string, CarddassCardType> = {
  ninja: "ni",
  technique: "te",
  te: "te",
  tactique: "ta",
  ta: "ta",
  client: "cl",
  clients: "cl",
  cl: "cl",
};

/** carddass.fr folder segment → series set code. */
const SERIES_DIR: Record<string, string> = {
  "1": "s1",
  "2": "s2",
  "3": "s3",
  "4": "s4",
  s4: "s4",
  "5": "s5",
  "6": "s6",
  promo: "promo",
};

/** Series / promo / special set folders under `cards/`. */
export function isNarutoSetDir(name: string): boolean {
  return /^(s\d+|promo|ns|spc)$/i.test(name);
}

/** Identity set code from a series slug (`s1`, `promo`, …). */
export function narutoSetCode(series: string): string {
  return series.trim().toLowerCase();
}

/** @deprecated Prefer {@link narutoSetCode} — same value now (no line prefix). */
export function cacgSetCode(series: string): string {
  return narutoSetCode(series);
}

function buildKey(
  set: string,
  number: string,
  grouping: string | null,
): string | null {
  return buildPrintKey({
    game: NARUTO_GAME,
    set,
    number,
    grouping,
  });
}

/**
 * Parse a carddass.fr image URL or pathname.
 * Returns null for thumbnails, chrome, or unrecognised files.
 */
export function parseCarddassAssetPath(
  urlOrPath: string,
): ParsedCarddassAsset | null {
  let pathname: string;
  try {
    pathname = urlOrPath.includes("://")
      ? new URL(urlOrPath).pathname
      : urlOrPath;
  } catch {
    pathname = urlOrPath;
  }
  pathname = decodeURIComponent(pathname).replace(/\\/g, "/");

  const lower = pathname.toLowerCase();
  if (!lower.includes("/naruto/images/cartes/")) return null;
  if (lower.includes("/cartes_med/")) return null;
  if (lower.includes("/packshots/")) return null;

  const m = pathname.match(
    /\/naruto\/images\/cartes\/([^/]+)\/(?:([^/]+)\/)?([^/]+\.(?:jpe?g|png|webp))$/i,
  );
  if (!m) return null;

  const seriesRaw = m[1]!.toLowerCase();
  const filename = m[3]!;
  const series = SERIES_DIR[seriesRaw];
  if (!series) return null;
  const resolvedSet = narutoSetCode(series);

  const base = filename.replace(/\.(jpe?g|png|webp)$/i, "");
  if (
    series === "promo" &&
    !/^(ninja|technique|tactique|client|te|ta|cl|ni)[\s_-]/i.test(base)
  ) {
    return null;
  }

  const stem = base.replace(/\s+/g, "-");
  const vc = /[-_]vc$/i.test(stem);
  let core = stem.replace(/[-_]vc$/i, "");

  let grouping: string | null = null;
  const cdf = core.match(/^(.*)[-_]cdf$/i);
  if (cdf) {
    core = cdf[1]!;
    grouping = "cdf";
  }

  const parts = core.match(
    /^(ninja|technique|tactique|client|clients|te|ta|cl|ni)[\s_-]+(\d+)$/i,
  );
  if (!parts) return null;

  const type = TYPE_FROM_PREFIX[parts[1]!.toLowerCase()];
  if (!type) return null;
  const numberDigits = parts[2]!;
  const number = `${type}${numberDigits}`;

  const printKey = buildKey(resolvedSet, number, grouping);
  if (!printKey) return null;

  const cardId = grouping ? `${number}-${grouping}` : number;

  return {
    set: resolvedSet,
    type,
    numberDigits,
    number,
    grouping,
    role: vc ? "corrected" : "art",
    printKey,
    cardId,
  };
}

/** Canonical on-disk name for a Carddass scrape role. */
export function carddassFaceFilename(
  role: ParsedCarddassAsset["role"],
  ext: string,
): string {
  const e = ext.startsWith(".") ? ext : `.${ext}`;
  return role === "corrected" ? `art.corrected${e}` : `art.carddass${e}`;
}

/**
 * Display order: `art.reconstructed.*` → `art.corrected.*` → dump
 * `art.<source>.*` (pixels via `face.json`, filename tie-break here).
 *
 * `reconstructed` wins because the official S5 faces carry a burnt-in
 * `www.carddass.fr` watermark and some errata scans are crude; a hand-made
 * face is the better thing to show. It never replaces the official file on
 * disk — that one stays as the authentic source.
 *
 * The `$` anchors matter: `art.reconstructed.png` and `art.corrected.jpg`
 * must not be picked up by the plain `art.*` pattern.
 */
export function pickPreferredFaceArtFilename(
  files: readonly string[],
  lang = "fr",
): string | null {
  let best: { name: string; rank: number } | null = null;
  for (const f of files) {
    const rank = faceArtRank(f, lang);
    if (rank > 0 && (!best || rank > best.rank)) best = { name: f, rank };
  }
  return best?.name ?? null;
}

/**
 * Display precedence of a face filename — higher wins. Any code choosing
 * between two faces must use this, so the order lives in one place: a scrape
 * merging freshly downloaded files with what is already on disk would
 * otherwise silently drop a reconstruction it does not know about.
 *
 * 0 means "not a face" (thumb, back, …).
 */
export function faceArtRank(filename: string, lang = "fr"): number {
  if (/^art\.reconstructed\.(jpe?g|png|webp|gif)$/i.test(filename)) return 300;
  if (/^art\.corrected\.(jpe?g|png|webp|gif)$/i.test(filename)) return 200;
  return narutoDumpFaceRank(filename, lang);
}

/** Prefer newest capture; CDX rows are [timestamp, original, …]. */
export function pickLatestCdxRow(
  rows: readonly (readonly string[])[],
): { timestamp: string; original: string } | null {
  let best: { timestamp: string; original: string } | null = null;
  for (const row of rows) {
    const timestamp = row[0];
    const original = row[1];
    if (!timestamp || !original) continue;
    if (!best || timestamp > best.timestamp) {
      best = { timestamp, original };
    }
  }
  return best;
}

export function waybackRawUrl(timestamp: string, original: string): string {
  const ts = timestamp.replace(/\D/g, "");
  return `https://web.archive.org/web/${ts}id_/${original}`;
}

const MED_TYPE: Record<string, CarddassCardType> = {
  ninja: "ni",
  ni: "ni",
  technique: "te",
  te: "te",
  tactique: "ta",
  ta: "ta",
  client: "cl",
  clients: "cl",
  cl: "cl",
};

/**
 * Parse a carddass.fr `cartes_med` filename → collector number.
 * Does not invent files — map-only helper for site thumbs already on disk.
 */
export function parseCarddassMedThumbFilename(
  filename: string,
): { type: CarddassCardType; number: string } | null {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const stem = base.replace(/\.(jpe?g|png|webp|gif)$/i, "");
  const m = stem.match(
    /^(ninja|technique|tactique|clients?|te|ta|cl|ni)[\s_-]*0*(\d+)/i,
  );
  if (!m) return null;
  const type = MED_TYPE[m[1]!.toLowerCase()];
  if (!type) return null;
  const numberDigits = String(Number.parseInt(m[2]!, 10));
  if (!Number.isFinite(Number(numberDigits))) return null;
  return {
    type,
    number: `${type}${numberDigits.padStart(3, "0")}`,
  };
}

/** Prefer med over mini over bare when several thumbs share a number. */
export function medThumbRank(filename: string): number {
  const low = filename.toLowerCase();
  if (low.includes("med")) return 3;
  if (low.includes("mini")) return 2;
  return 1;
}
