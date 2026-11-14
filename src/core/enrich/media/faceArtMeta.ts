/**
 * Face / cover art observations stamped at dig or resolve time.
 * Ranking and Affiche read these fields — they must not re-parse filenames.
 *
 * Transitional: {@link stampFaceArtMetaFromBasename} exists only so existing
 * on-disk `art.{kind}.*` layouts can populate columns until every dig writes
 * them explicitly. Prefer explicit stamps from harvest/sync.
 */

export const FACE_ART_KINDS = [
  "dump",
  "corrected",
  "reconstructed",
  "official",
  "sample",
] as const;

export type FaceArtKind = (typeof FACE_ART_KINDS)[number];

export type FaceArtMeta = {
  artKind: FaceArtKind;
  watermarked: boolean;
};

/**
 * Ingest-time map from a stored basename or dump token → metadata.
 * Call only when writing attachments / print_assets — not inside Affiche rank.
 */
export function stampFaceArtMetaFromBasename(
  artFileOrToken: string,
): FaceArtMeta {
  const name = artFileOrToken.trim().toLowerCase();
  if (/\.corrected\.|^(?:art\.)?corrected(?:\.|$)/i.test(name)) {
    return { artKind: "corrected", watermarked: false };
  }
  if (/\.reconstructed\.|^(?:art\.)?reconstructed(?:\.|$)/i.test(name)) {
    return { artKind: "reconstructed", watermarked: false };
  }
  if (/\.sample\.|^(?:art\.)?sample(?:\.|$)/i.test(name) || /\bsample\b/.test(name)) {
    return { artKind: "sample", watermarked: true };
  }
  if (/\.official\.|^(?:art\.)?official(?:\.|$)/i.test(name)) {
    return { artKind: "official", watermarked: false };
  }
  if (/\bdemo\b/.test(name)) {
    return { artKind: "dump", watermarked: true };
  }
  return { artKind: "dump", watermarked: false };
}

/** Soft quality boost for ranked covers (higher = better). */
export function faceArtKindQuality(artKind?: string | null): number {
  switch ((artKind || "").trim().toLowerCase()) {
    case "corrected":
      return 100;
    case "reconstructed":
      return 95;
    case "official":
      return 70;
    case "sample":
      return 20;
    case "dump":
    default:
      return 50;
  }
}

const FACE_ART_KIND_SET = new Set<string>(FACE_ART_KINDS);

function asFaceArtKind(raw: string | null | undefined): FaceArtKind | null {
  const key = (raw || "").trim().toLowerCase();
  if (!key || !FACE_ART_KIND_SET.has(key)) return null;
  return key as FaceArtKind;
}

/**
 * Dig / `writeAssets` stamp: prefer explicit harvest observations; basename
 * only fills gaps. Call at ingest — Affiche reads the stored columns.
 */
export function resolveFaceArtMetaForDig(input: {
  artFile?: string | null;
  artKind?: string | null;
  watermarked?: boolean | null;
}): FaceArtMeta {
  const fromFile = input.artFile?.trim()
    ? stampFaceArtMetaFromBasename(input.artFile)
    : { artKind: "dump" as const, watermarked: false };
  return {
    artKind: asFaceArtKind(input.artKind) ?? fromFile.artKind,
    watermarked:
      input.watermarked != null
        ? Boolean(input.watermarked)
        : fromFile.watermarked,
  };
}

/**
 * Affiche disk gallery: indexed winner prefers `print_assets` stamps;
 * siblings fill from basename only.
 */
export function resolveDiskFaceAttachmentMeta(input: {
  artFile: string;
  isIndexedWinner: boolean;
  winnerArtKind?: string | null;
  winnerWatermarked?: boolean | number | null;
}): FaceArtMeta {
  if (!input.isIndexedWinner) {
    return resolveFaceArtMetaForDig({ artFile: input.artFile });
  }
  const raw = input.winnerWatermarked;
  const watermarked =
    raw === 1 || raw === true
      ? true
      : raw === 0 || raw === false
        ? false
        : null;
  return resolveFaceArtMetaForDig({
    artFile: input.artFile,
    artKind: input.winnerArtKind,
    watermarked,
  });
}
