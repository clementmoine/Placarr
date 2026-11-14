/**
 * Per-pack ledger of prints whose **recto** carries locale-specific printed text.
 *
 * SSOT: `locale_specific_faces` in `catalog.sqlite`. JSON file is legacy
 * fallback only. Any catalogue pack can opt in via `CataloguePackInfo.localeArt`.
 */
import {
  existsSync,
  readFileSync,
  statSync,
} from "node:fs";

import type { CardsIndexV1 } from "@/effects/cardsIndex";
import { packLocaleSpecificFacesPath } from "@/lib/packPaths";
import {
  loadLocaleSpecificFacesFromSqlite,
  writeLocaleSpecificFacesToSqlite,
} from "@/providers/shared/sealedProducts/productsSqlite";

export type LocaleSpecificFacesV1 = {
  version: 1;
  /** Human note — ignored at runtime. */
  note?: string;
  faces: readonly { set: string; card: string }[];
};

const cache = new Map<string, { mtimeMs: number; keys: Set<string> }>();

export function localeSpecificFaceKey(set: string, card: string): string {
  const normalized = card.trim().padStart(4, "0");
  return `${set.trim().toLowerCase()}\0${normalized}`;
}

function isLocaleSpecificFacesV1(raw: unknown): raw is LocaleSpecificFacesV1 {
  if (!raw || typeof raw !== "object") return false;
  const faces = (raw as LocaleSpecificFacesV1).faces;
  if (!Array.isArray(faces)) return false;
  return faces.every(
    (row) =>
      row &&
      typeof row === "object" &&
      typeof row.set === "string" &&
      typeof row.card === "string",
  );
}

function slotHasArt(
  files: { art?: string | null; thumb?: string | null } | undefined,
): boolean {
  return Boolean(files?.art?.trim() || files?.thumb?.trim());
}

function slotHasLocalizedName(
  files: { name?: string | null } | undefined,
): boolean {
  return Boolean(files?.name?.trim());
}

export type BuildLocaleSpecificFacesOptions = {
  /**
   * When true, a locale with a title but no scan still counts toward the
   * dual-locale threshold. Carddass FR/IT titles without a local recto must
   * not borrow JA shop scans (e.g. TA-090 « Le don de la copie »).
   */
  countLocalizedNames?: boolean;
};

/**
 * Prints that already have a recto in ≥2 catalogue locales — text/layout almost
 * always differs (Mythos FR vs EN), so the catalogue must not borrow across langs.
 *
 * With {@link BuildLocaleSpecificFacesOptions.countLocalizedNames}, a localized
 * title alone also marks presence (Carddass EU text vs JA 忍/術).
 */
export function buildLocaleSpecificFacesFromIndex(
  index: CardsIndexV1,
  catalogueLocales: readonly string[],
  note?: string,
  opts?: BuildLocaleSpecificFacesOptions,
): LocaleSpecificFacesV1 {
  const locales = catalogueLocales
    .map((lang) => lang.trim().toLowerCase())
    .filter(Boolean);
  const countNames = opts?.countLocalizedNames === true;
  const slotPresent = (
    files: { art?: string | null; thumb?: string | null; name?: string | null } | undefined,
  ): boolean =>
    slotHasArt(files) || (countNames && slotHasLocalizedName(files));
  const faces: { set: string; card: string }[] = [];
  const seen = new Set<string>();

  for (const entry of Object.values(index.cards)) {
    const hitCount = locales.length
      ? locales.filter((lang) => slotPresent(entry.langs[lang])).length
      : Object.values(entry.langs).filter((files) => slotPresent(files)).length;
    if (hitCount < 2) continue;
    const key = localeSpecificFaceKey(entry.set, entry.card);
    if (seen.has(key)) continue;
    seen.add(key);
    faces.push({ set: entry.set, card: entry.card });
  }

  faces.sort(
    (a, b) =>
      a.set.localeCompare(b.set) ||
      a.card.localeCompare(b.card, undefined, { numeric: true }),
  );

  return {
    version: 1,
    note:
      note ??
      "Auto: recto présent dans ≥2 locales catalogue — ne pas emprunter cross-langue.",
    faces,
  };
}

export function writeLocaleSpecificFaces(
  pack: string,
  doc: LocaleSpecificFacesV1,
): { path: string; faces: number } {
  const written = writeLocaleSpecificFacesToSqlite(pack, doc.faces);
  cache.delete(pack);
  return { path: written.dbPath, faces: written.faces };
}

/** `null` when the pack has no ledger — every print is treated as language-neutral. */
export function loadLocaleSpecificFaces(pack: string): Set<string> | null {
  const fromSqlite = loadLocaleSpecificFacesFromSqlite(pack);
  if (fromSqlite) {
    cache.set(pack, { mtimeMs: Date.now(), keys: fromSqlite });
    return fromSqlite;
  }

  const dest = packLocaleSpecificFacesPath(pack);
  if (!existsSync(dest)) return null;
  const mtimeMs = statSync(dest).mtimeMs;
  const hit = cache.get(pack);
  if (hit && hit.mtimeMs === mtimeMs) return hit.keys;

  const raw = JSON.parse(readFileSync(dest, "utf8")) as unknown;
  if (!isLocaleSpecificFacesV1(raw)) {
    throw new Error(`locale-specific-faces invalide : ${dest}`);
  }
  const keys = new Set(
    raw.faces.map((row) => localeSpecificFaceKey(row.set, row.card)),
  );
  cache.set(pack, { mtimeMs, keys });
  return keys;
}

export function isLocaleSpecificFace(
  keys: Set<string> | null,
  set: string,
  card: string,
): boolean {
  if (!keys) return false;
  return keys.has(localeSpecificFaceKey(set, card));
}

/**
 * Runtime twin of {@link buildLocaleSpecificFacesFromIndex} for a single entry
 * — used so catalogue browse does not depend on a stale sqlite ledger.
 */
export function entryIsLocaleSpecificFace(
  entry: {
    langs: Record<
      string,
      { art?: string | null; thumb?: string | null; name?: string | null } | undefined
    >;
  },
  catalogueLocales: readonly string[],
  opts?: BuildLocaleSpecificFacesOptions,
): boolean {
  const locales = catalogueLocales
    .map((lang) => lang.trim().toLowerCase())
    .filter(Boolean);
  const countNames = opts?.countLocalizedNames === true;
  const present = (lang: string): boolean => {
    const files = entry.langs[lang];
    return (
      slotHasArt(files) || (countNames && slotHasLocalizedName(files))
    );
  };
  const hitCount = locales.length
    ? locales.filter(present).length
    : Object.keys(entry.langs).filter(present).length;
  return hitCount >= 2;
}

/** Test seam. */
export function clearLocaleSpecificFacesCache(): void {
  cache.clear();
}
