/**
 * Live HoloFoil lean contract (systemic — every foil, no per-material forks):
 *
 * 1. `_WorldSpaceCameraPos` stays at rest `(0, 1.5, 1.5)` — Unity world camera
 *    (elevation ≈ frontal), not a MAT lean slider.
 * 2. Pointer lean splits:
 *    - `_LightDirection` — full ±1 at card edge (spectrum / N·L travel).
 *    - `u_CardLean` — physical mesh tip matching CSS ±18°
 *      ({@link LIVE_MESH_LEAN_SCALE}), not ±45° into `normalize(lean,1,lean)`.
 *      Full ±1 TBN over-tips: SunPillar `clamp(N·V+0.16)` blacks the whole
 *      card at top-center; FlatSilver B·V gates fail with elevated cameras.
 *
 * The app authors its card flat, normal +Y — MAT sheets record
 * `_LightDirection` (0, 1, 0). Rest light must match; lean swings light
 * across X (left/right) and Z (along the card's vertical axis).
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
export function lightDirectionFromTilt(
  x: number,
  y: number,
): readonly [number, number, number] {
  const len = Math.hypot(x, 1, y) || 1;
  return [x / len, 1 / len, y / len];
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
  const N = lightDirectionFromTilt(x, y);
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
 * Rest `_WorldSpaceCameraPos` for Live HoloFoil: `(0, 1.5, 1.5)`.
 *
 * Several leaves multiply whole albedo by etch-view `N·V` with flat etch ≈ face
 * `+Y` (AceFoil, ClassicFoil, Squares). A pure +Y eye → gain 0; pure frontal
 * `(0,1,2)` → gain ≈0.45 (muddy print). `(0,2,1)` restores AceFoil but, even
 * with mesh tip at {@link LIVE_MESH_LEAN_SCALE}, FlatSilver `B·V` bottoms out
 * near the edge. `(0,1.5,1.5)` keeps AceFoil face gain ≈0.71 while FlatSilver
 * `B·V` / SunPillar `clamp(N·V+0.16)` stay healthy under mesh-scaled lean.
 * Lean must not move this eye — view changes via `u_CardLean`.
 *
 * `x` / `y` are accepted for call-site compatibility and ignored.
 */
export function cameraPosFromTilt(
  _x = 0,
  _y = 0,
): readonly [number, number, number] {
  return [0, 1.5, 1.5];
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
