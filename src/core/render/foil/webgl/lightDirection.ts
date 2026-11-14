/**
 * Live HoloFoil lean contract (systemic — every foil, no per-material forks):
 *
 * 1. `_WorldSpaceCameraPos` stays at rest `(0, 1.7, 1.3)` — Unity world camera
 *    (slightly elevated frontal), not a MAT lean slider.
 * 2. Pointer lean splits:
 *    - `_LightDirection` — orbits the **MAT sheet** rest (AceFoil `(0,1,0)`,
 *      Stamped/SvHolo `(0,0,1)`, SunPillar `(0,0,-1)`, …) at full ±1 edge.
 *      Forcing every leaf to +Y made UseVertexNomal leaves (Stamped) get
 *      N·L≈0 and crush under SDL 0.3.
 *    - `u_CardLean` — physical mesh tip matching CSS ±18°
 *      ({@link LIVE_MESH_LEAN_SCALE}), always Y-up card space — not ±45°.
 *
 * Callers should pass full-range lean (±1 at card edge) for Live light —
 * a Lorcana-style ±0.4 `_TimeFactor` cap leaves the light almost frontal.
 */

/** CSS / playroom card tip (±18°) → VS `normalize(lean.x, 1, lean.y)` scale. */
export const LIVE_MESH_LEAN_DEGREES = 18;
export const LIVE_MESH_LEAN_SCALE = Math.tan(
  (LIVE_MESH_LEAN_DEGREES * Math.PI) / 180,
);

/**
 * Scale pointer lean (±1 at edge) down to the physical mesh tip used by
 * `u_CardLean` / TBN. Light keeps the unscaled lean.
 */
export function meshLeanFromTilt(
  x: number,
  y: number,
): readonly [number, number] {
  return [x * LIVE_MESH_LEAN_SCALE, y * LIVE_MESH_LEAN_SCALE];
}

/**
 * Foil-only rest tip baked into `u_CardLean` (CSS tip stays pointer-true).
 *
 * Dump HoloFoil frags assume Unity face `N=+Z` (they read `N.yz`). Our VS
 * remaps face→+Y, so flat rest packs `N.yz=(1,0)` instead of Unity `(0,1)`.
 * One CSS +Y tip restores a usable packing: soft SunLava spectrum lobe and
 * the least-gray SunPillar rest we measure (full Unity face +Z / −Y tip both
 * regress sat). Y-rest leaves (AceFoil) stay unbiased.
 */
export const LIVE_REST_MESH_LEAN: readonly [number, number] = meshLeanFromTilt(
  0,
  1,
);

/**
 * Pointer mesh tip, plus {@link LIVE_REST_MESH_LEAN} when the MAT light rest
 * is Z-dominant (Unity face-axis leaves: SunLava +Z, SunPillar −Z, …).
 * Y-rest leaves (AceFoil, …) stay unbiased so CrossTexture lattice rests at
 * 0.5.
 */
export function meshLeanWithRestBias(
  x: number,
  y: number,
  restLight: readonly [number, number, number] = [0, 1, 0],
): readonly [number, number] {
  const tip = meshLeanFromTilt(x, y);
  const ax = Math.abs(restLight[0]);
  const ay = Math.abs(restLight[1]);
  const az = Math.abs(restLight[2]);
  if (az >= ax && az >= ay) {
    return [tip[0] + LIVE_REST_MESH_LEAN[0], tip[1] + LIVE_REST_MESH_LEAN[1]];
  }
  return tip;
}
/**
 * Map pointer lean onto a unit `_LightDirection`, orbiting the sheet rest.
 *
 * Dominant rest axis picks the lean plane (Y-up AceFoil vs Z-forward Stamped).
 */
export function lightDirectionFromTilt(
  x: number,
  y: number,
  rest: readonly [number, number, number] = [0, 1, 0],
): readonly [number, number, number] {
  const rx = rest[0];
  const ry = rest[1];
  const rz = rest[2];
  const rLen = Math.hypot(rx, ry, rz) || 1;
  const R: readonly [number, number, number] = [
    rx / rLen,
    ry / rLen,
    rz / rLen,
  ];
  const ax = Math.abs(R[0]);
  const ay = Math.abs(R[1]);
  const az = Math.abs(R[2]);
  if (ay >= ax && ay >= az) {
    const s = Math.sign(R[1]) || 1;
    const len = Math.hypot(x, 1, y) || 1;
    return [x / len, s / len, y / len];
  }
  if (az >= ax) {
    const s = Math.sign(R[2]) || 1;
    const len = Math.hypot(x, y, 1) || 1;
    return [x / len, y / len, s / len];
  }
  const s = Math.sign(R[0]) || 1;
  const len = Math.hypot(1, x, y) || 1;
  return [s / len, x / len, y / len];
}

/** MAT `_LightDirection` RGB (ignore alpha) → unit rest, default +Y. */
export function restLightFromSheet(
  color: number[] | undefined | null,
): readonly [number, number, number] {
  if (!color || color.length < 3) return [0, 1, 0];
  const len = Math.hypot(color[0]!, color[1]!, color[2]!) || 1;
  if (len < 1e-6) return [0, 1, 0];
  return [color[0]! / len, color[1]! / len, color[2]! / len];
}

export type LiveCardTbn = {
  T: readonly [number, number, number];
  B: readonly [number, number, number];
  N: readonly [number, number, number];
};

/**
 * World-space TBN for a Y-up Live card tipped by lean.
 *
 * Rest (`0,0`) matches the VS packing `T=(1,0,0)`, `B=(0,0,1)`, `N=(0,1,0)`.
 * AceFoil / RadiantHolo scroll CrossTexture from this normal path — a flat
 * TBN leaves their lattice frozen while only light moves.
 */
export function liveCardTbnFromLean(x: number, y: number): LiveCardTbn {
  // Mesh tip is always Y-up card space — independent of MAT light rest axis.
  const N = lightDirectionFromTilt(x, y, [0, 1, 0]);
  const tx = 1 - N[0] * N[0];
  const ty = -N[0] * N[1];
  const tz = -N[0] * N[2];
  const tLen = Math.hypot(tx, ty, tz);
  let T: readonly [number, number, number];
  if (tLen > 1e-4) {
    T = [tx / tLen, ty / tLen, tz / tLen];
  } else {
    // N ≈ ±X — Gram-Schmidt from (1,0,0) collapses; use cross(Z, N).
    const fx = -N[1];
    const fy = N[0];
    const fl = Math.hypot(fx, fy) || 1;
    T = [fx / fl, fy / fl, 0];
  }
  const B: readonly [number, number, number] = [
    T[1] * N[2] - T[2] * N[1],
    T[2] * N[0] - T[0] * N[2],
    T[0] * N[1] - T[1] * N[0],
  ];
  return { T, B, N };
}

/**
 * AceFoil CrossTexture lattice offset from `normalize(TBN · WorldToObject · N)`
 * with identity WorldToObject (our WebGL bind). Rest → 0.5; lean must move it.
 */
export function aceFoilNormalLatticeOffset(x: number, y: number): number {
  const { T, B, N } = liveCardTbnFromLean(x, y);
  const v0 = T[0] * N[0] + B[0] * N[1] + N[0] * N[2];
  const v1 = T[1] * N[0] + B[1] * N[1] + N[1] * N[2];
  const v2 = T[2] * N[0] + B[2] * N[1] + N[2] * N[2];
  const len = Math.hypot(v0, v1, v2) || 1;
  return ((v0 + v1 + v2) / len) * 0.5;
}

/**
 * Rest `_WorldSpaceCameraPos` for Live HoloFoil: `(0, 1.7, 1.3)`.
 *
 * Several leaves multiply whole albedo by etch-view `N·V` with flat etch ≈ face
 * `+Y` (AceFoil, ClassicFoil, Squares — Squares hits it twice). A pure +Y eye
 * → gain 0; pure frontal `(0,1,2)` → gain ≈0.45 (muddy). `(0,2,1)` restores
 * AceFoil but FlatSilver `B·V` bottoms out near the edge even with mesh tip at
 * {@link LIVE_MESH_LEAN_SCALE}. `(0,1.7,1.3)` keeps face gain ≈0.79 (Squares
 * still readable after a second multiply) while FlatSilver / SunPillar gates
 * stay healthy under mesh-scaled lean. Lean must not move this eye — view
 * changes via `u_CardLean`.
 *
 * `x` / `y` are accepted for call-site compatibility and ignored.
 */
export function cameraPosFromTilt(
  _x = 0,
  _y = 0,
): readonly [number, number, number] {
  return [0, 1.7, 1.3];
}

/**
 * Flat-etch view factor for FlatSilver-class frags (no `_e` plate).
 *
 * FlatSilver maps tangent etch `(0,0,1)` through the remapped TBN rows to
 * world `B` (see FlatSilver.frag etch → `dot(u_xlat5/7/8, etch)`). At rest
 * `B = +Z`. Optional `lean` tips TBN like `u_CardLean`.
 */
export function flatEtchViewFactor(
  camera: readonly [number, number, number],
  worldPos: readonly [number, number, number] = [0, 0, 0],
  lean: readonly [number, number] = [0, 0],
): number {
  const { B } = liveCardTbnFromLean(lean[0], lean[1]);
  const vx = camera[0] - worldPos[0];
  const vy = camera[1] - worldPos[1];
  const vz = camera[2] - worldPos[2];
  const len = Math.hypot(vx, vy, vz) || 1;
  return (B[0] * vx + B[1] * vy + B[2] * vz) / len;
}
