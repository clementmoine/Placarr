/**
 * Which stored face a Fusion World print shows.
 *
 * Ranking = shared `cardFaces` (pixels + provenance). No FACE_PRIORITY lists.
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

export const DBS_FW_FACE_SOURCES = [
  "dbscards",
  "bandai",
  "cardnexus",
  "client",
] as const;

export type DbsFwFaceSource = (typeof DBS_FW_FACE_SOURCES)[number];

const choice = createCardFaceChoice<DbsFwFaceSource>({
  sources: DBS_FW_FACE_SOURCES,
  coverProvenance: "catalog",
});

export const DBS_FW_FACE_ROLES = CARD_FACE_ROLES;
export type DbsFwFaceRole = CardFaceRole;
export const DBS_FW_FACE_DECISION_FILE = CARD_FACE_DECISION_FILE;
export type { FaceDecision };
export type DbsFwStoredFace = SharedStoredFace<DbsFwFaceSource>;

export const dbsFwFaceFilename = choice.faceFilename;
export const dbsFwFaceFileOf = choice.faceFileOf;
export const dbsFwFaceSourceOf = choice.faceSourceOf;
export const pickBestFwFace = choice.pickBestFace;
export const parseFwFaceDecision = choice.parseFaceDecision;
export const recordFwFaceDecision = choice.recordFaceDecision;

/**
 * Sync display resolve — re-rank dumps every time (`face.json` is not SSOT).
 */
export function resolveFwArtFilenameSync(
  cardDir: string,
  lang = "en",
  role: DbsFwFaceRole = "art",
): string | null {
  if (!existsSync(cardDir)) return null;
  let names: string[];
  try {
    names = readdirSync(cardDir);
  } catch {
    return null;
  }
  const candidates: { source: DbsFwFaceSource; file: string }[] = [];
  for (const name of names) {
    const parsed = dbsFwFaceFileOf(name);
    if (!parsed || parsed.role !== role) continue;
    candidates.push({ source: parsed.source, file: name });
  }
  if (candidates.length === 0) return null;
  // Lone dump — skip pixel probe (admin browse walks thousands of folders).
  if (candidates.length === 1) return candidates[0]!.file;

  const stored: DbsFwStoredFace[] = [];
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
  const best = pickBestFwFace(stored, lang);
  if (!best) return null;
  return (
    stored.find((face) => face.source === best)?.file ??
    dbsFwFaceFilename(best, role)
  );
}
