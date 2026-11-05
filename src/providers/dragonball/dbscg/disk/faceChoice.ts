/**
 * Which stored face a DBS Masters print shows.
 *
 * Ranking = shared `cardFaces` (pixels + provenance). No FACE_PRIORITY lists —
 * size already settles dbscards vs Deckplanet vs Bandai in practice.
 */
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
