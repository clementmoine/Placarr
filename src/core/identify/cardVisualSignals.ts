/**
 * Extra cardboard fingerprints beyond dHash — aHash + coarse color grid.
 * Built with sharp only (no OCR / AGPL). Used to reinforce "sure" when
 * several independent signals agree on the same printKey.
 */
import sharp from "sharp";

import {
  dHashFromBuffer,
  extractCardArtBand,
  hammingDistance,
} from "@/core/enrich/media/imageAssets";
import type {
  CardVisualIndexEntry,
  CardVisualIndexFile,
  CardVisualMatch,
} from "@/core/identify/cardVisualIndex";

export const COLOR_GRID_SIDE = 6;

export type CardVisualSignals = {
  dHash: string;
  aHash: string;
  /** Hex of {@link COLOR_GRID_SIDE}²×3 RGB means (uint8). */
  color: string;
};

export type DHashOptions = { artBand?: boolean };

/** Average-hash 64 bits — complementary to dHash (mean threshold vs gradient). */
export async function aHashFromBuffer(
  buffer: Buffer,
  opts?: DHashOptions,
): Promise<string | null> {
  try {
    let input = buffer;
    if (opts?.artBand) {
      const band = await extractCardArtBand(buffer);
      if (!band) return null;
      input = band;
    }
    const { data, info } = await sharp(input)
      .greyscale()
      .resize(8, 8, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const channels = info.channels;
    let sum = 0;
    const n = 64;
    for (let i = 0; i < n; i++) sum += data[i * channels] ?? 0;
    const mean = sum / n;
    let hash = "";
    for (let i = 0; i < n; i++) {
      hash += (data[i * channels] ?? 0) >= mean ? "1" : "0";
    }
    return hash;
  } catch {
    return null;
  }
}

/** Coarse art color layout — hex of 6×6 RGB cell means. */
export async function colorGridFromBuffer(
  buffer: Buffer,
  opts?: DHashOptions,
): Promise<string | null> {
  try {
    let input = buffer;
    if (opts?.artBand) {
      const band = await extractCardArtBand(buffer);
      if (!band) return null;
      input = band;
    }
    const side = COLOR_GRID_SIDE;
    const { data, info } = await sharp(input)
      .resize(side, side, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.channels < 3) return null;
    let hex = "";
    for (let i = 0; i < side * side; i++) {
      const o = i * info.channels;
      for (let c = 0; c < 3; c++) {
        hex += (data[o + c] ?? 0).toString(16).padStart(2, "0");
      }
    }
    return hex;
  } catch {
    return null;
  }
}

/** Mean absolute RGB difference (0–255) between two color grids. */
export function colorGridDistance(a: string, b: string): number {
  const bytes = Math.min(a.length, b.length);
  if (bytes < 6) return 255;
  let sum = 0;
  let n = 0;
  for (let i = 0; i + 1 < bytes; i += 2) {
    const av = Number.parseInt(a.slice(i, i + 2), 16);
    const bv = Number.parseInt(b.slice(i, i + 2), 16);
    if (Number.isNaN(av) || Number.isNaN(bv)) continue;
    sum += Math.abs(av - bv);
    n += 1;
  }
  return n ? sum / n : 255;
}

/** One art-band pass → dHash + aHash + color (index build + live query). */
export async function extractCardVisualSignals(
  buffer: Buffer,
  opts?: DHashOptions,
): Promise<CardVisualSignals | null> {
  try {
    let input = buffer;
    if (opts?.artBand !== false) {
      const band = await extractCardArtBand(buffer);
      if (!band) return null;
      input = band;
    }
    const [dHash, aHash, color] = await Promise.all([
      dHashFromBuffer(input, { artBand: false }),
      aHashFromBuffer(input, { artBand: false }),
      colorGridFromBuffer(input, { artBand: false }),
    ]);
    if (!dHash || !aHash || !color) return null;
    return { dHash, aHash, color };
  } catch {
    return null;
  }
}

export type SignalMatchOpts = {
  limit?: number;
  maxDHash?: number;
  maxAHash?: number;
  maxColor?: number;
  minMargin?: number;
};

/**
 * Rank by fused cost: dHash + 0.5·aHash + color/4.
 * Keeps only candidates that pass at least one tight channel (or soft dHash).
 */
export function matchCardVisualSignals(
  query: CardVisualSignals,
  index: CardVisualIndexFile,
  opts?: SignalMatchOpts,
): CardVisualMatch[] {
  const limit = opts?.limit ?? 5;
  const maxDHash = opts?.maxDHash ?? 12;
  const maxAHash = opts?.maxAHash ?? 14;
  const maxColor = opts?.maxColor ?? 55;
  const minMargin = opts?.minMargin ?? 2;

  const scored: Array<CardVisualMatch & { votes: number; fused: number }> = [];
  for (const entry of index.entries) {
    const dDist = hammingDistance(query.dHash, entry.hash);
    const aDist = entry.aHash
      ? hammingDistance(query.aHash, entry.aHash)
      : 64;
    const cDist = entry.color
      ? colorGridDistance(query.color, entry.color)
      : 255;

    let votes = 0;
    if (dDist <= 6) votes += 1;
    if (entry.aHash && aDist <= 8) votes += 1;
    if (entry.color && cDist <= 40) votes += 1;

    // Need a plausible dHash OR (aHash+color) pair to enter the shortlist.
    const plausible =
      dDist <= maxDHash ||
      (entry.aHash != null &&
        entry.color != null &&
        aDist <= maxAHash &&
        cDist <= maxColor);
    if (!plausible) continue;

    const fused = dDist + aDist * 0.5 + cDist / 4;
    scored.push({
      printKey: entry.printKey,
      lang: entry.lang,
      // Expose dHash distance for sure-gate compatibility; fused used to rank.
      distance: dDist,
      artRel: entry.artRel,
      packId: index.packId,
      votes,
      fused,
    });
  }

  scored.sort(
    (a, b) =>
      b.votes - a.votes ||
      a.fused - b.fused ||
      a.distance - b.distance ||
      a.printKey.localeCompare(b.printKey),
  );

  // Dedupe printKey keeping best rank.
  const seen = new Set<string>();
  const unique: typeof scored = [];
  for (const row of scored) {
    if (seen.has(row.printKey)) continue;
    seen.add(row.printKey);
    unique.push(row);
  }

  const top = unique.slice(0, limit);
  if (
    top.length >= 2 &&
    top[0]!.votes === top[1]!.votes &&
    top[1]!.fused - top[0]!.fused < minMargin
  ) {
    return top.map(({ fused: _f, ...row }) => ({
      ...row,
      ambiguous: true,
    }));
  }
  return top.map(({ fused: _f, ...row }) => row);
}

export function matchCardVisualSignalsAcrossPacks(
  query: CardVisualSignals,
  indexes: CardVisualIndexFile[],
  opts?: SignalMatchOpts,
): CardVisualMatch[] {
  const limit = opts?.limit ?? 5;
  const minMargin = opts?.minMargin ?? 2;
  const pooled: CardVisualMatch[] = [];
  for (const index of indexes) {
    if (!index.entries.length) continue;
    pooled.push(
      ...matchCardVisualSignals(query, index, {
        ...opts,
        limit: Math.max(limit, 12),
        minMargin: 0,
      }),
    );
  }
  pooled.sort(
    (a, b) => a.distance - b.distance || a.printKey.localeCompare(b.printKey),
  );
  // Re-rank with a second pass isn't available without votes — keep dHash order
  // after merging; votes already shaped per-pack shortlists.
  const seen = new Set<string>();
  const unique: CardVisualMatch[] = [];
  for (const row of pooled) {
    if (seen.has(row.printKey)) continue;
    seen.add(row.printKey);
    unique.push(row);
  }
  const top = unique.slice(0, limit);
  if (
    top.length >= 2 &&
    top[1]!.distance - top[0]!.distance < minMargin
  ) {
    return top.map((row) => ({ ...row, ambiguous: true }));
  }
  return top.map(({ ambiguous: _a, ...row }) => row);
}

/** True when query and entry agree on ≥2 independent channels. */
export function signalsAgree(
  query: CardVisualSignals,
  entry: Pick<CardVisualIndexEntry, "hash" | "aHash" | "color">,
  opts?: { maxDHash?: number; maxAHash?: number; maxColor?: number },
): boolean {
  const maxD = opts?.maxDHash ?? 6;
  const maxA = opts?.maxAHash ?? 8;
  const maxC = opts?.maxColor ?? 40;
  let votes = 0;
  if (hammingDistance(query.dHash, entry.hash) <= maxD) votes += 1;
  if (entry.aHash && hammingDistance(query.aHash, entry.aHash) <= maxA) {
    votes += 1;
  }
  if (entry.color && colorGridDistance(query.color, entry.color) <= maxC) {
    votes += 1;
  }
  return votes >= 2;
}
