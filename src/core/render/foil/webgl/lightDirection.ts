/**
 * Map normalised card lean (`setTilt`, ~[-1, 1]) → Unity `_LightDirection`.
 *
 * The app authors its card flat, normal +Y — its `MAT_Cards3D_*` sheets all
 * record `_LightDirection` (0, 1, 0). Rest must reproduce exactly that
 * (frontal in card space); the lean swings the light across X (left/right)
 * and Z (along the card's vertical axis).
 *
 * Callers should pass full-range lean (±1 at card edge) for Live HoloFoil —
 * a Lorcana-style ±0.4 `_TimeFactor` cap leaves the light almost frontal.
 */
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
 * TBN leaves their lattice frozen while only light/camera move.
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
 * Rest camera sits above the Y-up card at `(0, 2, 0)`. Several Live frags
 * (SolidColor, …) drive their foil from the view vector
 * `_WorldSpaceCameraPos − worldPos` and never read `_Tilt` — without moving
 * the camera on lean those leaves look frozen even while the CSS transform
 * tilts the canvas.
 *
 * Scale ≈ 2.5: at full ±1 lean the camera walks ~card extent, matching the
 * stronger view shift you get tilting a card in TCG Live (CSS only spins ±18°).
 */
export function cameraPosFromTilt(
  x: number,
  y: number,
): readonly [number, number, number] {
  return [x * 2.5, 2, y * 2.5];
}
