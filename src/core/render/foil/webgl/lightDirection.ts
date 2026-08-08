/**
 * Map normalised card lean (`setTilt`, ~[-1, 1]) → Unity `_LightDirection`.
 *
 * The app authors its card flat, normal +Y — its `MAT_Cards3D_*` sheets all
 * record `_LightDirection` (0, 1, 0). Rest must reproduce exactly that
 * (frontal in card space); the lean swings the light across X (left/right)
 * and Z (along the card's vertical axis).
 */
export function lightDirectionFromTilt(
  x: number,
  y: number,
): readonly [number, number, number] {
  const len = Math.hypot(x, 1, y) || 1;
  return [x / len, 1 / len, y / len];
}

/**
 * Rest camera sits above the Y-up card at `(0, 2, 0)`. Several Live frags
 * (SolidColor, …) drive their foil from the view vector
 * `_WorldSpaceCameraPos − worldPos` and never read `_Tilt` — without moving
 * the camera on lean those leaves look frozen even while the CSS transform
 * tilts the canvas.
 *
 * Scale ≈ 2 keeps the offset on the same order as the card extent so a
 * typical ±0.4 lean is a visible spectrum / sheen shift, not a micro nudge.
 */
export function cameraPosFromTilt(
  x: number,
  y: number,
): readonly [number, number, number] {
  return [x * 2, 2, y * 2];
}
