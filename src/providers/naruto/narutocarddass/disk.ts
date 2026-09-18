/**
 * Action module: disk.ts
 * Merged from: narutoCardPath.ts, faceChoice.ts, narutoCardDisk.ts, narutoFaceBytes.ts, carddasVol1Face.ts
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { assetsPackBase } from "@/lib/packAssetUrls";
import {
  CARD_FACE_DECISION_FILE,
  CARD_FACE_ROLES,
  createCardFaceChoice,
  type CardFaceRole,
  type FaceDecision,
  type StoredFace as SharedStoredFace,
} from "@/providers/shared/cardFaces";
import {
  appearanceSetsOf,
  isNarutoFamilyFolder,
  narutoCardDiskFolder,
  narutoDiskCardId,
  parseNarutoCollector,
  primaryAppearanceSet,
  type NarutoCollectorFamily,
  type NarutoLangAppearances,
} from "./identity";
import { carddasJpCardlistCards } from "./parse/bandai";

// --- from narutoCardPath.ts ---

/**
 * Naruto face paths: `cards/{folder}/{ni0001|n0001}/{lang}/`.
 * Alt JP lines use their prefix as folder (`gaku/gaku0001`, `shi/shi0001`).
 * Series folders (`s1`, `s28`) are the old layout — still readable.
 */


export type NarutoCardPathId = {
  family: NarutoCollectorFamily;
  folder: string;
  diskId: string;
  lang: string;
};

/**
 * `JAP` / `JP` → `ja`. Une langue absente rend `""` plutôt que de jeter.
 *
 * Le paramètre était typé `string` mais recevait `null` : un tirage sans aucun
 * titre n'a pas de langue, et **188 d'entre eux** existent au catalogue. Le
 * `.trim()` sur `null` faisait jeter la construction du candidat — et comme la
 * recherche enveloppe chaque provider dans un `allSettled`, une seule de ces
 * cartes vidait **tout** le résultat. Chercher « cl04 » ne rendait rien, parce
 * que la requête croisait `cl-0043`, qui n'a pas de titre.
 */
export function normalizeNarutoLang(lang: string | null | undefined): string {
  const code = (lang ?? "").trim().toLowerCase();
  if (code === "jap" || code === "jp") return "ja";
  return code;
}

export function narutoCardPathFromCollector(
  raw: string,
  lang: string | null | undefined,
  appearanceSet?: string | null,
): NarutoCardPathId | null {
  const id = parseNarutoCollector(raw);
  const diskId = narutoDiskCardId(raw, appearanceSet);
  if (!id || !diskId) return null;
  /*
    La langue est un **segment du chemin** (`ninja/ni0001/fr`). Sans elle, il n'y
    a pas de chemin à donner — et un dossier vide pointerait à côté. On rend
    `null`, ce que les appelants savent lire : ils n'attachent alors ni art ni
    vignette, et la carte reste sélectionnable par sa seule référence.
  */
  const code = normalizeNarutoLang(lang);
  if (!code) return null;
  return {
    family: id.family,
    folder: narutoCardDiskFolder(id),
    diskId,
    lang: code,
  };
}

/** `ninja/ni0001/fr` · `gaku/gaku0001/ja` */
export function narutoCardRelPath(id: NarutoCardPathId): string {
  return `${id.folder}/${id.diskId}/${id.lang}`;
}

export function narutoCardRelSegments(id: NarutoCardPathId): string[] {
  return [id.folder, id.diskId, id.lang];
}

/** Old dump: `s1/fr/ni001`. */
export function legacyNarutoCardRelPath(
  appearanceSet: string,
  lang: string,
  cardId: string,
): string {
  return `${appearanceSet}/${lang}/${cardId}`;
}

export function narutoAssetsCardUrl(
  pack: string,
  id: NarutoCardPathId,
  file: string,
): string {
  const parts = [...narutoCardRelSegments(id), file].map((p) =>
    encodeURIComponent(p),
  );
  return `${assetsPackBase(pack)}/cards/${parts.join("/")}`;
}

export function isNewNarutoCardLayoutRoot(name: string): boolean {
  return isNarutoFamilyFolder(name);
}

const NARUTO_LANGS = new Set(["fr", "en", "it", "ja"]);

export function isNarutoLangDir(name: string): boolean {
  return NARUTO_LANGS.has(normalizeNarutoLang(name));
}

// --- from faceChoice.ts ---

/**
 * Which stored face a Naruto print shows.
 *
 * Same mechanism as DBS — `providers/shared/cardFaces`. Every dump is kept as
 * `art.<source>.<ext>`; `face.json` names the winner. Hand-made
 * `art.reconstructed.*` and errata `art.corrected.*` sit above the dumps
 * (watermarked official S5 vs a reconstruction).
 */

export const NARUTO_FACE_SOURCES = [
  "drive",
  "vintage",
  "goat",
  "stop2shop",
  "carddass",
  "ultrajeux",
  "nikita",
  "suruga",
  "avalon",
  "fril",
  "coleka",
  "cardgameclub",
  "primegame",
  "leboncoin",
  "ebay",
  "mercari",
  "yahoo",
  "carddas",
  /**
   * La cardlist officielle sert trois GIF doubles (術-192, 術-348, 術-358) :
   * la même carte sous deux illustrations (produits distributeur / pack,
   * voir curated/sources/carddas-jp-double-illustrations.json). Découpés à la
   * main en deux faces : A = illustration du haut, B = celle du bas.
   */
  "carddas-a",
  "carddas-b",
  "zabuza",
  /**
   * slab-z.com — un guide de collectionneur, pas une boutique. Ses scans sont
   * à plat, bien éclairés et cadrés sur la carte, là où les photos de place de
   * marché sont carrées et laissent la moitié du cadre au fond.
   */
  "slabz",
  "chitoroshop",
  /**
   * fr.shopping.rakuten.com — scans boutique à plat (NOPAD), sans watermark
   * carddass.fr. En FR ils concourent avec le dump éditeur : les pixels
   * tranchent (517×740 bat 350×495 watermarké). Coleka reste hors pool.
   */
  "rakuten",
  /**
   * tv-tokyo.co.jp — pages officielles Naruto 2002 (Bandai/Pierrot/TV Tokyo).
   * Variantes double illustration : `tvtokyo-a` / `tvtokyo-b` (fichiers *a.jpg /
   * *b.jpg), même contrat que carddas-a/b.
   */
  "tvtokyo",
  "tvtokyo-a",
  "tvtokyo-b",
  /**
   * narutocardgame.gg classic CCG archive — 350×490 EN faces. Fill holes only;
   * pixels keep larger Drive / Vintage dumps ahead.
   */
  "narutocardgamegg",
  "legacy",
  "fanset",
] as const;

export type NarutoFaceSource = (typeof NARUTO_FACE_SOURCES)[number];

/**
 * Tie-break per locale among dumps of the same kind. Pixels still decide
 * between two publisher scans. `legacy` is leftover unsourced `art.jpg`.
 *
 * Coleka FR dumps are collector photos (glare, table, worn corners) at
 * 900×1200. Official carddass.fr raws are 350×495. Area scoring would pick
 * Coleka; on FR we keep the publisher-grade pool instead (carddass /
 * ultrajeux / rakuten NOPAD). Pixels still decide inside that pool.
 *
 * `fanset` is an unconfirmed remake or custom. Keep the file, never compare
 * it to the original, and never let pixel size beat another dump.
 */
export const NARUTO_FR_PUBLISHER_SOURCES: ReadonlySet<NarutoFaceSource> =
  new Set(["carddass", "ultrajeux", "rakuten"]);

export const NARUTO_FACE_PRIORITY: Record<string, readonly NarutoFaceSource[]> =
  {
    fr: [
      "carddass",
      "ultrajeux",
      "rakuten",
      "tvtokyo",
      "tvtokyo-a",
      "tvtokyo-b",
      "coleka",
      "cardgameclub",
      "primegame",
      "leboncoin",
      "ebay",
      "mercari",
      "yahoo",
      "drive",
      "nikita",
      "suruga",
      "avalon",
      "fril",
      "chitoroshop",
      "vintage",
      "goat",
      "stop2shop",
      "carddas",
      "carddas-a",
      "carddas-b",
      "zabuza",
      "slabz",
      "narutocardgamegg",
      "legacy",
      "fanset",
    ],
    en: [
      "drive",
      "vintage",
      "goat",
      "stop2shop",
      "coleka",
      "cardgameclub",
      "primegame",
      "ebay",
      "leboncoin",
      "mercari",
      "yahoo",
      "carddass",
      "ultrajeux",
      "nikita",
      "suruga",
      "avalon",
      "fril",
      "carddas",
      "carddas-a",
      "carddas-b",
      "zabuza",
      "slabz",
      "chitoroshop",
      "rakuten",
      "tvtokyo",
      "tvtokyo-a",
      "tvtokyo-b",
      "narutocardgamegg",
      "legacy",
      "fanset",
    ],
    it: [
      "cardgameclub",
      "primegame",
      "coleka",
      "ebay",
      "leboncoin",
      "mercari",
      "yahoo",
      "drive",
      "carddass",
      "ultrajeux",
      "vintage",
      "goat",
      "stop2shop",
      "nikita",
      "suruga",
      "avalon",
      "fril",
      "carddas",
      "carddas-a",
      "carddas-b",
      "zabuza",
      "slabz",
      "chitoroshop",
      "rakuten",
      "tvtokyo",
      "tvtokyo-a",
      "tvtokyo-b",
      "narutocardgamegg",
      "legacy",
      "fanset",
    ],
    ja: [
      // Devant nikita, dont les vignettes plafonnent à 340×500.
      "slabz",
      "chitoroshop",
      "nikita",
      "suruga",
      "avalon",
      "fril",
      "carddas",
      "carddas-a",
      "carddas-b",
      "zabuza",
      "carddass",
      "ultrajeux",
      "drive",
      "vintage",
      "goat",
      "stop2shop",
      "coleka",
      "cardgameclub",
      "primegame",
      "ebay",
      "leboncoin",
      "mercari",
      "yahoo",
      "rakuten",
      "tvtokyo",
      "tvtokyo-a",
      "tvtokyo-b",
      "narutocardgamegg",
      "legacy",
      "fanset",
    ],
  };

const choice = createCardFaceChoice<NarutoFaceSource>({
  sources: NARUTO_FACE_SOURCES,
  priority: NARUTO_FACE_PRIORITY,
  coverProvenance: "catalog",
});

export const NARUTO_FACE_ROLES = CARD_FACE_ROLES;
export type NarutoFaceRole = CardFaceRole;
export const NARUTO_FACE_DECISION_FILE = CARD_FACE_DECISION_FILE;
export type { FaceDecision };
export type NarutoStoredFace = SharedStoredFace<NarutoFaceSource>;

export const narutoFaceFilename = choice.faceFilename;
export const narutoFaceFileOf = choice.faceFileOf;
export const recordNarutoFaceDecision = choice.recordFaceDecision;

export function pickBestNarutoDumpFace(
  faces: readonly NarutoStoredFace[],
  lang = "fr",
): NarutoFaceSource | null {
  let pool = faces;
  if (lang.toLowerCase() === "fr") {
    const official = faces.filter((face) =>
      NARUTO_FR_PUBLISHER_SOURCES.has(face.source),
    );
    if (official.length) pool = official;
  }
  const attested = pool.filter((face) => face.source !== "fanset");
  if (attested.length) return choice.pickBestFace(attested, lang);
  return choice.pickBestFace(pool, lang);
}

const LEGACY_ART = /^art\.(jpe?g|png|gif|webp)$/i;
const SPECIAL_ART = /^art\.(reconstructed|corrected)\.(jpe?g|png|webp|gif)$/i;

/**
 * `face.json` may name a dump (`art.suruga.jpg`), unsourced `art.jpg`, or a
 * hand-made special. Shared `parseFaceDecision` only accepts `art.<source>.`.
 */
export function parseNarutoFaceDecision(
  json: string,
  role: CardFaceRole = "art",
): string | null {
  const named = choice.parseFaceDecision(json, role);
  if (named) return named;
  try {
    const raw = JSON.parse(json) as FaceDecision;
    const file = raw?.[role]?.trim();
    if (!file || role !== "art") return null;
    if (narutoFaceSourceOf(file) || SPECIAL_ART.test(file)) return file;
    return null;
  } catch {
    return null;
  }
}

/** Named dump, or unsourced `art.jpg` counted as `legacy`. */
export function narutoFaceSourceOf(filename: string): NarutoFaceSource | null {
  const sourced = choice.faceSourceOf(filename);
  if (sourced) return sourced;
  if (LEGACY_ART.test(filename)) return "legacy";
  return null;
}

/** Higher wins among dumps. 0 = not a dump face. */
export function narutoDumpFaceRank(filename: string, lang = "fr"): number {
  const source = narutoFaceSourceOf(filename);
  if (!source) return 0;
  const list =
    NARUTO_FACE_PRIORITY[lang.toLowerCase()] ?? NARUTO_FACE_PRIORITY.fr!;
  const idx = list.indexOf(source);
  const order = idx >= 0 ? idx : list.length;
  return 100 - order;
}

// --- from narutoCardDisk.ts ---

/**
 * Absolute card folders. New tree: `{family}/{ni0001}/{lang}`.
 * Legacy `{s1}/{lang}/{ni001}` is still listed so thumbs / reconstruct dual-read.
 */


export function narutoCardAbsDir(
  cardsDir: string,
  cardId: string,
  lang: string,
  appearanceSet?: string | null,
): string | null {
  const id = narutoCardPathFromCollector(cardId, lang, appearanceSet);
  if (!id) return null;
  return path.join(cardsDir, narutoCardRelPath(id));
}

export type NarutoOnDiskCard = {
  abs: string;
  family: string;
  diskId: string;
  lang: string;
  appearanceSet: string | null;
};

function dirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => {
    if (name.startsWith(".")) return false;
    try {
      return statSync(path.join(dir, name)).isDirectory();
    } catch {
      return false;
    }
  });
}

export function listNarutoCardDirs(
  cardsDir: string,
  appearances: Record<string, NarutoLangAppearances> = {},
): NarutoOnDiskCard[] {
  if (!existsSync(cardsDir)) return [];
  const out: NarutoOnDiskCard[] = [];
  for (const family of dirs(cardsDir)) {
    if (!isNarutoFamilyFolder(family)) continue;
    const familyDir = path.join(cardsDir, family);
    for (const diskId of dirs(familyDir)) {
      if (family === "promo" && isNarutoLangDir(diskId)) continue;
      const diskDir = path.join(familyDir, diskId);
      for (const lang of dirs(diskDir)) {
        const code = normalizeNarutoLang(lang);
        const sets = appearanceSetsOf(appearances[diskId]?.[code]);
        out.push({
          abs: path.join(diskDir, lang),
          family,
          diskId,
          lang: code,
          appearanceSet: sets.length ? primaryAppearanceSet(sets) : null,
        });
      }
    }
  }
  for (const set of dirs(cardsDir)) {
    if (isNarutoFamilyFolder(set) && set !== "promo") continue;
    const setDir = path.join(cardsDir, set);
    for (const lang of dirs(setDir)) {
      /*
        New family tree is `{promo}/{pr0096}/{fr}`. Without this guard the
        legacy walker treats `pr0096` as a language and `fr` as a card id —
        installing the same PNG to `cards/ninja/fr/pr0096/`.
      */
      if (!isNarutoLangDir(lang)) continue;
      const langDir = path.join(setDir, lang);
      for (const cardId of dirs(langDir)) {
        const parsed = parseNarutoCollector(cardId);
        const diskId = narutoDiskCardId(cardId, set) ?? cardId;
        out.push({
          abs: path.join(langDir, cardId),
          family: parsed?.family ?? "ninja",
          diskId,
          lang: normalizeNarutoLang(lang),
          appearanceSet: set.toLowerCase(),
        });
      }
    }
  }
  return out;
}

// --- from narutoFaceBytes.ts ---

/**
 * Shared bytes helpers for catalogue face installs.
 *
 * Each dump is `art.<source>.<ext>` — never overwrite another source. The
 * displayed file is chosen afterwards (`promoteNarutoFace` → `face.json`).
 */



// ─── marketplace padding detection ───────────────────────────────

const MINT_MAX_DISTANCE = 14;
const PADDED_MIN_SHARE = 0.35;

/** Un vert menthe clair désaturé — le fond type du composite. */
function isMintish(r: number, g: number, b: number): boolean {
  return g > r + 5 && g > b + 3 && r > 120;
}

export async function isMarketplacePaddedImage(buf: Buffer): Promise<boolean> {
  const { default: sharp } = await import("sharp");
  const size = 64;
  const { data } = await sharp(buf)
    .resize(size, size, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number): [number, number, number] => {
    const i = (y * size + x) * 3;
    return [data[i]!, data[i + 1]!, data[i + 2]!];
  };
  const bg = at(0, 0);
  if (!isMintish(...bg)) return false;
  let close = 0;
  for (let i = 0; i < data.length; i += 3) {
    if (
      Math.abs(data[i]! - bg[0]) < MINT_MAX_DISTANCE &&
      Math.abs(data[i + 1]! - bg[1]) < MINT_MAX_DISTANCE &&
      Math.abs(data[i + 2]! - bg[2]) < MINT_MAX_DISTANCE
    ) {
      close += 1;
    }
  }
  return close / (size * size) > PADDED_MIN_SHARE;
}

export function extFromMagic(buf: Buffer): string {
  if (
    buf.length >= 3 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[2] === 0xff
  ) {
    return ".jpg";
  }
  if (buf.subarray(0, 4).toString("ascii") === "GIF8") return ".gif";
  if (buf.length >= 8 && buf.subarray(1, 4).toString("ascii") === "PNG") {
    return ".png";
  }
  if (buf.length >= 12 && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    return ".webp";
  }
  return ".bin";
}

function extForFaceFile(buf: Buffer): string {
  const ext = extFromMagic(buf);
  return ext === ".jpeg" ? ".jpg" : ext;
}

export function existingNarutoArtForSource(
  cardDir: string,
  source: NarutoFaceSource,
): string | null {
  if (!existsSync(cardDir)) return null;
  const hit = readdirSync(cardDir).find(
    (name) => narutoFaceSourceOf(name) === source,
  );
  return hit ?? null;
}

export function writeNarutoArtFile(
  cardDir: string,
  buf: Buffer,
  source: NarutoFaceSource,
): string {
  const ext = extForFaceFile(buf);
  const destName = narutoFaceFilename(source, "art", ext.slice(1));
  mkdirSync(cardDir, { recursive: true });
  for (const name of readdirSync(cardDir)) {
    if (name === destName) continue;
    if (narutoFaceSourceOf(name) === source) {
      unlinkSync(path.join(cardDir, name));
    }
  }
  writeFileSync(path.join(cardDir, destName), buf);
  return destName;
}

const SPECIAL_FACE = /^art\.(reconstructed|corrected)\.(jpe?g|png|webp|gif)$/i;

export async function promoteNarutoFace(
  cardDir: string,
  lang: string,
): Promise<string | null> {
  if (!existsSync(cardDir)) return null;
  const files = readdirSync(cardDir);
  const reconstructed = files.find((name) =>
    /^art\.reconstructed\.(jpe?g|png|webp|gif)$/i.test(name),
  );
  if (reconstructed) {
    recordNarutoFaceDecision(cardDir, "art", reconstructed);
    return reconstructed;
  }
  const corrected = files.find((name) =>
    /^art\.corrected\.(jpe?g|png|webp|gif)$/i.test(name),
  );
  if (corrected) {
    recordNarutoFaceDecision(cardDir, "art", corrected);
    return corrected;
  }
  const { default: sharp } = await import("sharp");
  const stored: NarutoStoredFace[] = [];
  for (const name of files) {
    if (SPECIAL_FACE.test(name)) continue;
    const source = narutoFaceSourceOf(name);
    if (!source) continue;
    try {
      const meta = await sharp(path.join(cardDir, name)).metadata();
      /*
        Un composite marketing (photo paddée, fond menthe, watermark boutique)
        n'est pas une face : il ne peut pas gagner le choix, quelques soient
        ses pixels. Mesuré : 35 faces JA fril concernées le 2026-08-31.
      */
      if (
        await isMarketplacePaddedImage(readFileSync(path.join(cardDir, name)))
      ) {
        continue;
      }
      stored.push({
        source,
        file: name,
        width: meta.width ?? 0,
        height: meta.height ?? 0,
      });
    } catch {
      stored.push({ source, file: name, width: 0, height: 0 });
    }
  }
  const best = pickBestNarutoDumpFace(stored, lang);
  if (!best) return null;
  const winner = stored.find((face) => face.source === best);
  const filename = winner?.file ?? narutoFaceFilename(best);
  recordNarutoFaceDecision(cardDir, "art", filename);
  return filename;
}

export async function promoteAllNarutoFaces(root: string): Promise<number> {
  const cardsDir = path.join(root, "cards");
  let rewritten = 0;
  for (const hit of listNarutoCardDirs(cardsDir)) {
    const before = existsSync(path.join(hit.abs, NARUTO_FACE_DECISION_FILE))
      ? readFileSync(path.join(hit.abs, NARUTO_FACE_DECISION_FILE), "utf8")
      : "";
    const named = await promoteNarutoFace(hit.abs, hit.lang);
    if (!named) continue;
    const after = existsSync(path.join(hit.abs, NARUTO_FACE_DECISION_FILE))
      ? readFileSync(path.join(hit.abs, NARUTO_FACE_DECISION_FILE), "utf8")
      : "";
    if (after !== before) rewritten += 1;
  }
  return rewritten;
}

export async function saveNarutoFace(opts: {
  cardDir: string;
  buf: Buffer;
  source: NarutoFaceSource;
  lang: string;
  force?: boolean;
}): Promise<"ok" | "skip"> {
  const had = existingNarutoArtForSource(opts.cardDir, opts.source);
  if (!opts.force && had) {
    await promoteNarutoFace(opts.cardDir, opts.lang);
    return "skip";
  }
  /*
    Les marketplaces servent parfois un composite marketing (photo paddée sur
    fond menthe, watermark boutique) au lieu de la photo brute : on ne le
    stocke pas comme face, même en dump — il n'atteste rien de plus que la
    galerie dont il est tiré.
  */
  if (await isMarketplacePaddedImage(opts.buf)) {
    return "skip";
  }
  writeNarutoArtFile(opts.cardDir, opts.buf, opts.source);
  await promoteNarutoFace(opts.cardDir, opts.lang);
  return "ok";
}

// --- from carddasVol1Face.ts ---

/**
 * Official JP Carddass 巻ノ… vol.1 face GIFs (`shinobi-003_1.gif`, …).
 * Pure — no I/O.
 */

const PRINTED_TO_KIND: Record<string, string> = {
  忍: "shinobi",
  術: "jutsu",
  作: "saku",
  依: "irai",
};

/** `maki7` → 7. */
export function carddasJpVolumeNumberFromSetCode(
  setCode: string,
): number | null {
  const m = /^maki(\d{1,2})$/i.exec(setCode.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  return Number.isFinite(n) && n >= 1 && n <= 17 ? n : null;
}

/** `忍-146` + 巻ノ七 → `shinobi-146_7`. */
export function carddasJpVolumeFaceStem(
  printed: string,
  volume: number,
): string | null {
  const m = /^(忍|術|作|依)-(\d+)$/.exec(printed.trim());
  if (!m) return null;
  const kind = PRINTED_TO_KIND[m[1]!];
  if (!kind) return null;
  const n = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  if (!Number.isFinite(volume) || volume < 1 || volume > 17) return null;
  return `${kind}-${String(n).padStart(3, "0")}_${volume}`;
}

/** `忍-3` → `shinobi-003_1`. */
export function carddasJpVol1FaceStem(printed: string): string | null {
  return carddasJpVolumeFaceStem(printed, 1);
}

/** Candidate live URLs (Wayback originals). */
export function carddasJpVol1FaceOriginalUrls(stem: string): string[] {
  const file = `${stem}.gif`;
  return [
    `http://www.carddas.com/naruto/cardlist/card_img/${file}`,
    `http://www.carddass.com/naruto/cardlist/card_img/${file}`,
    `http://www.carddas.com/cgi-bin/naruto/view_naruto.cgi?/${stem}.gif`,
  ];
}

export function carddasJpVolumeFaceOriginalUrls(stem: string): string[] {
  const bare = stem.replace(/_\d{1,2}$/, "");
  return [
    ...carddasJpVol1FaceOriginalUrls(stem),
    `http://www.carddas.com/naruto/card/${bare}.gif`,
    `http://www.carddass.com/naruto/card/${bare}.gif`,
  ];
}

/** Snapshots that retained 1st.shtml viewer HTML (GIF body often still 404). */
export const CARDDAS_JP_VOL1_WAYBACK_TIMESTAMPS = [
  "20071224051112",
  "20071016145510",
  "20160506074951",
] as const;

export function waybackImageUrl(timestamp: string, original: string): string {
  const ts = timestamp.replace(/\D/g, "");
  return `https://web.archive.org/web/${ts}im_/${original}`;
}

export type CarddasJpVol1FaceTarget = {
  printed: string;
  number: string;
  stem: string;
  original: string;
};

/** All 巻ノ壱 checklist rows that map to a vol.1 GIF stem. */
export function carddasJpVol1FaceTargets(
  setCode = "maki1",
): CarddasJpVol1FaceTarget[] {
  return carddasJpVolumeFaceTargets(setCode);
}

/** Checklist rows for one 巻ノ… (or every volume when `setCode` is omitted). */
export function carddasJpVolumeFaceTargets(
  setCode?: string,
): CarddasJpVol1FaceTarget[] {
  const out: CarddasJpVol1FaceTarget[] = [];
  for (const row of carddasJpCardlistCards()) {
    if (setCode && row.setCode !== setCode) continue;
    const volume = carddasJpVolumeNumberFromSetCode(row.setCode);
    if (!volume) continue;
    const stem = carddasJpVolumeFaceStem(row.printed, volume);
    if (!stem) continue;
    out.push({
      printed: row.printed,
      number: row.number,
      stem,
      original: carddasJpVolumeFaceOriginalUrls(stem)[0]!,
    });
  }
  return out;
}
