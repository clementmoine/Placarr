/**
 * Rank catalogue card faces by **criteria** — pixels + provenance + filename
 * quality markers (`corrected` / `reconstructed`). Never by provider-name lists.
 *
 * Shared by Catalogue → Cards tiles, `/prints/…/face` resolve, and pack
 * `createCardFaceChoice` when comparing on-disk `art.*` files.
 */
import {
  coverProvenanceRank,
  resolveCoverProvenance,
} from "@/core/enrich/media/coverProvenance";

export type CatalogueFaceRankInput = {
  /** Basename, e.g. `art.coleka.webp`. */
  artFile: string;
  width?: number | null;
  height?: number | null;
  /** Observed provenance; unknown → catalog (never demote without evidence). */
  coverProvenance?: string | null;
  /** Thumb-only slot (no full art) — soft demotion. */
  thumbOnly?: boolean;
};

export type CatalogueFaceCandidate = {
  /** Stable id (usually dump source) — used for declaration-order ties. */
  id: string;
  artFile: string;
  width?: number | null;
  height?: number | null;
  coverProvenance?: string | null;
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
 * Filename quality markers only — not provider ids.
 * Higher = better when pixel size is unknown or tied.
 */
export function catalogueArtQualityMarker(artFile: string): number {
  const name = artFile.trim().toLowerCase();
  const match = /^art\.([^.]+)\./i.exec(name);
  const source = match?.[1] ?? "";
  if (source.includes("corrected") || /\.corrected\./i.test(name)) return 100;
  if (source.includes("reconstructed")) return 95;
  return 50;
}

/**
 * Higher is better. With dims: area scaled by quality marker and provenance
 * demotion. Without dims: quality marker alone (equal sources → equal score).
 */
export function catalogueFaceRankScore(input: CatalogueFaceRankInput): number {
  const art = input.artFile?.trim();
  if (!art) return -1;

  const marker = catalogueArtQualityMarker(art);
  const provenance = resolveCoverProvenance({
    coverProvenance: input.coverProvenance,
  });
  /*
    Provenance demotion: listing_photo / user_photo shrink the score so a
    slightly larger seller photo does not beat a catalog scan of similar size.
    catalog → ×1 ; listing_photo → ×0.7 ; user_photo → ×0.55.
  */
  const provRank = coverProvenanceRank(provenance);
  const provenanceScale = provRank === 0 ? 1 : provRank === 1 ? 0.7 : 0.55;

  const w = input.width ?? 0;
  const h = input.height ?? 0;
  let score =
    w > 0 && h > 0
      ? Math.floor(w * h * (marker / 50) * provenanceScale)
      : Math.floor(marker * provenanceScale);

  if (input.thumbOnly) score = Math.floor(score * 0.5);
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
    const coverProvenance = resolveCoverProvenance({
      coverProvenance: face.coverProvenance,
    });
    const provenanceRank = coverProvenanceRank(coverProvenance);
    const score = catalogueFaceRankScore({
      artFile: face.artFile,
      width: face.width,
      height: face.height,
      coverProvenance,
      thumbOnly: face.thumbOnly,
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
