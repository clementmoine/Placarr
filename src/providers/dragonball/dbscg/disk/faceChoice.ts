/**
 * Which stored face a DBS Masters print shows.
 *
 * The mechanism is shared — see `providers/shared/cardFaces` for why a face is
 * chosen rather than raced for. What belongs to this pack is the source list
 * and its per-locale tie-break.
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
export const DBS_FACE_SOURCES = ["dbscards", "bandai", "deckplanet"] as const;

export type DbsFaceSource = (typeof DBS_FACE_SOURCES)[number];

/**
 * Preferred order per locale, best first — the tie-break, not the rule.
 *
 * Deliberately *not* dominating size, because with today's sources it could
 * only make things worse. Measured: Deckplanet serves 260x363 on the older
 * English sets and 860x1205 on the recent ones, while dbscards is a steady
 * 400x560. An English list headed by Deckplanet would therefore lose on the
 * old sets. Size-first already picks correctly everywhere — dbscards in
 * French, dbscards on old English, Deckplanet on recent English.
 *
 * It earns its keep the day a source is better without being bigger: the Fnac
 * scans are 500x680 *without* the SAMPLE watermark every other source carries.
 * That is the rule this list is here to hold when it comes.
 */
export const DBS_FACE_PRIORITY: Record<string, readonly DbsFaceSource[]> = {
  // Deckplanet mirrors no French printing at all.
  fr: ["dbscards", "bandai"],
  en: ["deckplanet", "dbscards", "bandai"],
};

const choice = createCardFaceChoice<DbsFaceSource>({
  sources: DBS_FACE_SOURCES,
  priority: DBS_FACE_PRIORITY,
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
