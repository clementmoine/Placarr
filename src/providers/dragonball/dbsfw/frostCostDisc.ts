/**
 * Cost-disc UV params from Frost/Card (translated Metal → FrostCard.frag).
 * Source of truth: `data/dragonball/fw/foil/shaders/FrostCard.frag` literals
 * `vec4(offsetX, offsetY, …)` paired with `vec4(scaleX, scaleY, …)`.
 */

export type FrostCostDisc = {
  /** Cost digit this disc belongs to (1-based; first pair in frag = cost 1). */
  cost: number;
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
};

/**
 * Cost-1 disc — first offset/scale pair in FrostCard.frag (~L936–938).
 * Used when the frag file is unavailable (tests / browser).
 */
export const FROST_COST_DISC_1: FrostCostDisc = {
  cost: 1,
  offsetX: 0.328700006,
  offsetY: -0.459199995,
  scaleX: 25.5998878,
  scaleY: 35.714283,
};

/**
 * Parse cost-disc table from FrostCard.frag source text.
 * Matches `xyxy + vec4(ox, oy, …)` then nearby `* vec4(sx, sy, …)`.
 */
export function parseFrostCostDiscTable(fragSource: string): FrostCostDisc[] {
  const offsetRe =
    /vs_INTERP0\.xyxy\s*\+\s*vec4\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,/g;
  const scaleRe = /\*\s*vec4\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,/g;
  const offsets: { x: number; y: number; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = offsetRe.exec(fragSource))) {
    offsets.push({
      x: Number(m[1]),
      y: Number(m[2]),
      index: m.index,
    });
  }
  const scales: { x: number; y: number; index: number }[] = [];
  while ((m = scaleRe.exec(fragSource))) {
    const sx = Number(m[1]);
    const sy = Number(m[2]);
    // Cost discs use large scales (~16–36); skip tiny / unrelated vec4s.
    if (sx < 8 || sy < 8) continue;
    scales.push({ x: sx, y: sy, index: m.index });
  }
  const discs: FrostCostDisc[] = [];
  for (let i = 0; i < offsets.length; i += 1) {
    const off = offsets[i]!;
    const scale =
      scales.find((s) => s.index > off.index && s.index < off.index + 400) ??
      scales[i];
    if (!scale) continue;
    // Deduplicate identical offset pairs (frag repeats cost-1 maths).
    if (
      discs.some(
        (d) =>
          Math.abs(d.offsetX - off.x) < 1e-6 &&
          Math.abs(d.offsetY - off.y) < 1e-6 &&
          Math.abs(d.scaleX - scale.x) < 1e-4,
      )
    ) {
      continue;
    }
    discs.push({
      cost: discs.length + 1,
      offsetX: off.x,
      offsetY: off.y,
      scaleX: scale.x,
      scaleY: scale.y,
    });
  }
  return discs.length > 0 ? discs : [FROST_COST_DISC_1];
}

export function frostCostDiscForCost(
  discs: readonly FrostCostDisc[],
  cost: number,
): FrostCostDisc {
  return discs.find((d) => d.cost === cost) ?? discs[0] ?? FROST_COST_DISC_1;
}

/** Frost cost disc diameter in card pixels (`cardWidth / scaleX`). */
export function frostCostDiscDiameter(
  cardWidth: number,
  disc: FrostCostDisc = FROST_COST_DISC_1,
): number {
  return cardWidth / disc.scaleX;
}
