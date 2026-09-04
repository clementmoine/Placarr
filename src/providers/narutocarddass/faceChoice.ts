/**
 * Which stored face a Naruto print shows.
 *
 * Same mechanism as DBS — `providers/shared/cardFaces`. Every dump is kept as
 * `art.<source>.<ext>`; `face.json` names the winner. Hand-made
 * `art.reconstructed.*` and errata `art.corrected.*` sit above the dumps
 * (watermarked official S5 vs a reconstruction).
 */
import {
  CARD_FACE_DECISION_FILE,
  CARD_FACE_ROLES,
  createCardFaceChoice,
  type CardFaceRole,
  type FaceDecision,
  type StoredFace as SharedStoredFace,
} from "@/providers/shared/cardFaces";

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
