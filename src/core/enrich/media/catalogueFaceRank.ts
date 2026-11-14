/**
 * Catalogue disk faces as **Affiche observations** — stamped `artKind` /
 * `watermarked` / `coverProvenance` + pixels. Basename is only used when
 * building the observation ({@link resolveFaceArtMetaForDig}), never as a
 * parallel name-list dialect.
 *
 * Scoring keeps a TCG area × aspect adapter (stub floor, near-square demotion)
 * on top of the same stamps Affiche reads via {@link rankCoversForDisplay}.
 */
import type { ScoredAttachmentInput } from "@/core/enrich/media/attachmentDisplayTypes";
import {
  coverProvenanceRank,
  resolveCoverProvenance,
} from "@/core/enrich/media/coverProvenance";
import {
  faceArtKindQuality,
  resolveFaceArtMetaForDig,
  type FaceArtKind,
} from "@/core/enrich/media/faceArtMeta";

export type CatalogueFaceRankInput = {
  /** Basename, e.g. `art.coleka.webp` — storage path only when meta missing. */
  artFile: string;
  width?: number | null;
  height?: number | null;
  /** Observed provenance; unknown → catalog (never demote without evidence). */
  coverProvenance?: string | null;
  /** Thumb-only slot (no full art) — soft demotion. */
  thumbOnly?: boolean;
  /** Ingest-stamped kind — preferred over basename markers when set. */
  artKind?: string | null;
  /** Ingest-stamped watermark — demotes when true. */
  watermarked?: boolean | null;
};

export type CatalogueFaceCandidate = {
  /** Stable id (usually dump source) — used for declaration-order ties. */
  id: string;
  artFile: string;
  width?: number | null;
  height?: number | null;
  coverProvenance?: string | null;
  thumbOnly?: boolean;
  artKind?: string | null;
  watermarked?: boolean | null;
};

/** Affiche-shaped face observation (stamps resolved once). */
export type CatalogueFaceObservation = {
  artFile: string;
  width?: number | null;
  height?: number | null;
  coverProvenance: string;
  artKind: FaceArtKind;
  watermarked: boolean;
  thumbOnly?: boolean;
};

export type PickBestCatalogueFaceOpts = {
  /**
   * Under this pixel area, prefer larger surface over score (padded thumbs
   * vs real pack photos). Default 0 = off.
   */
  areaDecidesBelow?: number;
  /**
   * Catalog dumps below this area do not demote a larger listing_photo
   * (stub GIF ~50k px). Default 100_000 when areaDecidesBelow is set, else
   * 100_000 always for provenance comparisons.
   */
  provenanceStubFloor?: number;
  /**
   * When scores + provenance tie: earlier id wins. Defaults to first-seen
   * order of `candidates`.
   */
  tieBreakIds?: readonly string[];
};

/**
 * Build the stamped observation Affiche / catalogue rank both consume.
 * Basename fills gaps only here — never inside Affiche compare.
 */
export function observeCatalogueFace(
  input: CatalogueFaceRankInput,
): CatalogueFaceObservation | null {
  const art = input.artFile?.trim();
  if (!art) return null;
  const meta = resolveFaceArtMetaForDig({
    artFile: art,
    artKind: input.artKind,
    watermarked: input.watermarked,
  });
  return {
    artFile: art,
    width: input.width,
    height: input.height,
    coverProvenance: resolveCoverProvenance({
      coverProvenance: input.coverProvenance,
    }),
    artKind: meta.artKind,
    watermarked: meta.watermarked,
    thumbOnly: input.thumbOnly,
  };
}

/**
 * Project a catalogue face into an Affiche `ScoredAttachmentInput`.
 * URL is a stable synthetic key unless callers pass a real asset URL.
 */
export function catalogueFaceAsScoredAttachment(
  obs: CatalogueFaceObservation,
  opts?: { url?: string; source?: string | null },
): ScoredAttachmentInput {
  return {
    type: "cover",
    url: opts?.url ?? `catalogue-face://${obs.artFile}`,
    role: "face",
    source: opts?.source ?? null,
    coverProvenance: obs.coverProvenance,
    artKind: obs.artKind,
    watermarked: obs.watermarked,
  };
}

/** Soft quality from Affiche face stamps (watermark demotes hardest). */
export function catalogueFaceQualityMarker(input: {
  artFile: string;
  artKind?: string | null;
  watermarked?: boolean | null;
}): number {
  const obs = observeCatalogueFace(input);
  if (!obs) return -1;
  if (obs.watermarked) return 20;
  return faceArtKindQuality(obs.artKind);
}

/** Near-1:1 embeds (DOCX / padded squares) lose to real packshot aspect. */
export function catalogueNearSquareScale(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 1;
  const ratio = Math.min(width, height) / Math.max(width, height);
  return ratio >= 0.92 ? 0.15 : 1;
}

/**
 * Higher is better. TCG adapter: area × Affiche stamp quality × provenance
 * scale × near-square. Without dims: stamp quality alone.
 */
export function catalogueFaceRankScore(input: CatalogueFaceRankInput): number {
  const obs = observeCatalogueFace(input);
  if (!obs) return -1;

  const marker = obs.watermarked
    ? 20
    : faceArtKindQuality(obs.artKind);
  /*
    Provenance demotion: listing_photo / user_photo shrink the score so a
    slightly larger seller photo does not beat a catalog scan of similar size.
    catalog → ×1 ; listing_photo → ×0.7 ; user_photo → ×0.55.
  */
  const provRank = coverProvenanceRank(obs.coverProvenance);
  const provenanceScale = provRank === 0 ? 1 : provRank === 1 ? 0.7 : 0.55;

  const w = obs.width ?? 0;
  const h = obs.height ?? 0;
  const aspectScale = catalogueNearSquareScale(w, h);
  let score =
    w > 0 && h > 0
      ? Math.floor(w * h * (marker / 50) * provenanceScale * aspectScale)
      : Math.floor(marker * provenanceScale);

  if (obs.thumbOnly) score = Math.floor(score * 0.5);
  return score;
}

function candidateArea(c: CatalogueFaceCandidate): number {
  const w = c.width ?? 0;
  const h = c.height ?? 0;
  return w > 0 && h > 0 ? w * h : 0;
}

function tieBreakIndex(
  id: string,
  order: readonly string[],
): number {
  const idx = order.indexOf(id);
  return idx >= 0 ? idx : order.length;
}

/**
 * Pick the best measurable face. Unmeasurable candidates (width/height ≤ 0)
 * are skipped — never ranked by source-name lists.
 */
export function pickBestCatalogueFace(
  candidates: readonly CatalogueFaceCandidate[],
  opts?: PickBestCatalogueFaceOpts,
): CatalogueFaceCandidate | null {
  const measurable = candidates.filter((c) => candidateArea(c) > 0);
  if (!measurable.length) return null;

  const areaFloor = opts?.areaDecidesBelow ?? 0;
  const stubFloor =
    opts?.provenanceStubFloor ??
    (areaFloor > 0 ? Math.min(100_000, areaFloor) : 100_000);
  const tieOrder =
    opts?.tieBreakIds ?? measurable.map((c) => c.id);

  let best: {
    face: CatalogueFaceCandidate;
    score: number;
    provenanceRank: number;
  } | null = null;

  for (const face of measurable) {
    const obs = observeCatalogueFace(face);
    if (!obs) continue;
    const provenanceRank = coverProvenanceRank(obs.coverProvenance);
    const score = catalogueFaceRankScore({
      artFile: obs.artFile,
      width: obs.width,
      height: obs.height,
      coverProvenance: obs.coverProvenance,
      thumbOnly: obs.thumbOnly,
      artKind: obs.artKind,
      watermarked: obs.watermarked,
    });
    const area = candidateArea(face);
    const bestArea = best ? candidateArea(best.face) : 0;

    /*
      Provenance catalog > listing_photo. Exception: a stub catalogue dump
      (carddass.fr GIF ~200×247 ≈ 50k px) must not demote a real seller photo.
    */
    if (best && provenanceRank !== best.provenanceRank && stubFloor > 0) {
      const faceUsable = area >= stubFloor;
      const bestUsable = bestArea >= stubFloor;
      if (provenanceRank < best.provenanceRank) {
        if (faceUsable || !bestUsable) {
          best = { face, score, provenanceRank };
        }
        continue;
      }
      if (!bestUsable && faceUsable) {
        best = { face, score, provenanceRank };
      }
      continue;
    }
    if (best && provenanceRank < best.provenanceRank) {
      best = { face, score, provenanceRank };
      continue;
    }
    if (best && provenanceRank > best.provenanceRank) continue;

    const bothTiny =
      best != null &&
      areaFloor > 0 &&
      area < areaFloor &&
      bestArea < areaFloor;
    if (bothTiny) {
      if (area > bestArea) best = { face, score, provenanceRank };
      else if (area === bestArea) {
        const faceTie = tieBreakIndex(face.id, tieOrder);
        const bestTie = tieBreakIndex(best!.face.id, tieOrder);
        if (
          faceTie < bestTie ||
          (faceTie === bestTie &&
            face.artFile.localeCompare(best!.face.artFile) < 0)
        ) {
          best = { face, score, provenanceRank };
        }
      }
      continue;
    }

    if (!best) {
      best = { face, score, provenanceRank };
      continue;
    }
    if (score > best.score) {
      best = { face, score, provenanceRank };
      continue;
    }
    if (score === best.score) {
      const faceTie = tieBreakIndex(face.id, tieOrder);
      const bestTie = tieBreakIndex(best.face.id, tieOrder);
      if (
        faceTie < bestTie ||
        (faceTie === bestTie &&
          face.artFile.localeCompare(best.face.artFile) < 0)
      ) {
        best = { face, score, provenanceRank };
      }
    }
  }

  return best?.face ?? null;
}
