/**
 * Which stored face a DBS Masters print shows.
 *
 * Ranking = shared `cardFaces` (pixels + provenance). No FACE_PRIORITY lists —
 * size already settles dbscards vs Deckplanet vs Bandai in practice.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { probeFaceFileDimensionsSync } from "@/providers/shared/faceFileDimensions";
import {
  CARD_FACE_DECISION_FILE,
  CARD_FACE_ROLES,
  createCardFaceChoice,
  type CardFaceRole,
  type FaceDecision,
  type StoredFace as SharedStoredFace,
} from "@/providers/shared/cardFaces";

/** Every source a stored face can come from. */
export const DBS_FACE_SOURCES = [
  "dbscards",
  "bandai",
  "deckplanet",
  "cardnexus",
] as const;

export type DbsFaceSource = (typeof DBS_FACE_SOURCES)[number];

const choice = createCardFaceChoice<DbsFaceSource>({
  sources: DBS_FACE_SOURCES,
  coverProvenance: "catalog",
});

export const DBS_FACE_ROLES = CARD_FACE_ROLES;
export type DbsFaceRole = CardFaceRole;
export const DBS_FACE_DECISION_FILE = CARD_FACE_DECISION_FILE;
export type { FaceDecision };
export type StoredFace = SharedStoredFace<DbsFaceSource>;

export const dbsFaceFilename = choice.faceFilename;
export const dbsFaceFileOf = choice.faceFileOf;
export const dbsFaceSourceOf = choice.faceSourceOf;
export const pickBestFace = choice.pickBestFace;
export const parseFaceDecision = choice.parseFaceDecision;
export const serializeFaceDecision = choice.serializeFaceDecision;
export const recordFaceDecision = choice.recordFaceDecision;

/**
 * Sync display resolve — re-rank dumps every time (`face.json` is not SSOT).
 */
export function resolveDbsArtFilenameSync(
  cardDir: string,
  lang = "fr",
  role: DbsFaceRole = "art",
): string | null {
  if (!existsSync(cardDir)) return null;
  let names: string[];
  try {
    names = readdirSync(cardDir);
  } catch {
    return null;
  }
  const candidates: { source: DbsFaceSource; file: string }[] = [];
  for (const name of names) {
    const parsed = dbsFaceFileOf(name);
    if (!parsed || parsed.role !== role) continue;
    candidates.push({ source: parsed.source, file: name });
  }
  if (candidates.length === 0) return null;
  // Lone dump — skip pixel probe (admin browse walks thousands of folders).
  if (candidates.length === 1) return candidates[0]!.file;

  const stored: StoredFace[] = [];
  for (const candidate of candidates) {
    // Soft-fill when probe fails — still compete by provenance.
    const dims = probeFaceFileDimensionsSync(
      path.join(cardDir, candidate.file),
    ) ?? { width: 1, height: 1 };
    stored.push({
      source: candidate.source,
      file: candidate.file,
      width: dims.width,
      height: dims.height,
    });
  }
  const best = pickBestFace(stored, lang);
  if (!best) return null;
  return (
    stored.find((face) => face.source === best)?.file ??
    dbsFaceFilename(best, role)
  );
}
