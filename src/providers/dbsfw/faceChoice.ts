/**
 * Which stored face a Fusion World print shows.
 *
 * The mechanism is shared — see `providers/shared/cardFaces`. What belongs to
 * this pack is the source list, and it is shorter than Masters': Deckplanet
 * mirrors no Fusion World printing at all, so there are two sources, dbscards
 * and Bandai's own cardlist image.
 */
import {
  CARD_FACE_DECISION_FILE,
  CARD_FACE_ROLES,
  createCardFaceChoice,
  type CardFaceRole,
  type FaceDecision,
  type StoredFace as SharedStoredFace,
} from "@/providers/shared/cardFaces";

export const DBS_FW_FACE_SOURCES = ["dbscards", "bandai"] as const;

export type DbsFwFaceSource = (typeof DBS_FW_FACE_SOURCES)[number];

/**
 * The tie-break, per locale — the ranking itself is on pixels.
 *
 * Both locales read the same way because both have the same two sources:
 * dbscards serves 400x560 where Bandai's cardlist is smaller, so size already
 * settles it and this list only breaks an exact tie.
 */
export const DBS_FW_FACE_PRIORITY: Record<
  string,
  readonly DbsFwFaceSource[]
> = {
  en: ["dbscards", "bandai"],
  ja: ["dbscards", "bandai"],
};

const choice = createCardFaceChoice<DbsFwFaceSource>({
  sources: DBS_FW_FACE_SOURCES,
  priority: DBS_FW_FACE_PRIORITY,
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
