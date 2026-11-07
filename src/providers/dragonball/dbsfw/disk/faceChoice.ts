/**
 * Which stored face a Fusion World print shows.
 *
 * Ranking = shared `cardFaces` (pixels + provenance). No FACE_PRIORITY lists.
 */
import {
  CARD_FACE_DECISION_FILE,
  CARD_FACE_ROLES,
  createCardFaceChoice,
  type CardFaceRole,
  type FaceDecision,
  type StoredFace as SharedStoredFace,
} from "@/providers/shared/cardFaces";

export const DBS_FW_FACE_SOURCES = ["dbscards", "bandai", "cardnexus"] as const;

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
