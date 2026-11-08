/**
 * Foil lean / scroll interaction policy — shared by WebGL + CSS backends.
 *
 * Material traits (`_TimeFactor`, dual-frag sibling) decide amplitude and
 * clock mode. Pack ids stay out of this file.
 */

/** CSS / mesh tip degrees at full pointer edge. */
export const FOIL_MAX_TILT_DEG = 18;

/**
 * Dual-frag / `_CosTime` scroll amplitude when the sheet omits `_TimeFactor`.
 * Live HoloFoil (single-frag) does not use this path — see
 * {@link FOIL_LIVE_LEAN_AMPLITUDE}.
 */
export const FOIL_DUAL_FRAG_TIME_FACTOR = 0.4;

/**
 * Live light lean: full edge → ±1 into `_LightDirection` (camera stays rest).
 * Mesh TBN (`u_CardLean`) is scaled to {@link FOIL_MAX_TILT_DEG} in the renderer.
 */
export const FOIL_LIVE_LEAN_AMPLITUDE = 1;

/**
 * Map a light position (0..100, 50 at rest) to one lean component for
 * `setTilt` / light+TBN (or dual-frag `_Tilt` phase).
 *
 * Dual-frag Time-scroll uses `_CosTime.w * _TimeFactor` (±timeFactor). Live
 * single-frag maps the same 0..100 pointer onto ±{@amplitude} so a full
 * card-edge sweep matches the Mac client's visible spectrum / sheen travel.
 */
export function tiltFromLightPercent(
  lightPercent: number,
  amplitude: number = FOIL_DUAL_FRAG_TIME_FACTOR,
): number {
  return ((lightPercent - 50) / 50) * amplitude;
}

/**
 * Pointer light % → Live WebGL `setTilt` XY.
 *
 * Vertical matches CSS dip-under-finger once VS height is +Z toward card top
 * (`local.z = uv.y - 0.5`): pointer-bottom → +lean.y → N tips toward +Z (top).
 */
export function liveWebglTiltFromLight(
  lightX: number,
  lightY: number,
  amplitude: number,
): readonly [number, number] {
  return [
    tiltFromLightPercent(lightX, amplitude),
    tiltFromLightPercent(lightY, amplitude),
  ];
}

/**
 * How far `setTilt` should travel at the card edge.
 *
 * - Sheets with `_TimeFactor` (dual-frag CosTime / tilt-frag phase) use it.
 * - Dual-frag without an explicit factor falls back to
 *   {@link FOIL_DUAL_FRAG_TIME_FACTOR}.
 * - Single-frag Live sheets omit `_TimeFactor` — use full ±1 so
 *   `_LightDirection` swings (a ±0.4 light cap starved the sheen vs TCG Live).
 */
export function foilLeanAmplitude(opts: {
  timeFactor?: number | null;
  hasTimeSibling?: boolean;
}): number {
  if (opts.timeFactor != null && Number.isFinite(opts.timeFactor)) {
    return opts.timeFactor;
  }
  if (opts.hasTimeSibling) return FOIL_DUAL_FRAG_TIME_FACTOR;
  return FOIL_LIVE_LEAN_AMPLITUDE;
}

/**
 * Which WebGL scroll clock to run while the card is idle vs pointer-driven.
 *
 * Single-frag Live HoloFoil bakes `_Time` motif scroll **and** light/view
 * response in one program. Flipping to `"tilt"` on hover used to unsubscribe
 * the shared clock — `_Time` froze and the foil looked "posed" under the
 * cursor while Live keeps shimmering. Dual-frag sheets alone ship a sibling
 * (`fragmentTime` / tilt); only then may hover swap programs.
 */
export function foilScrollModeForInteraction(opts: {
  isDriven: boolean;
  /** True when the material has a separate SCROLLMODE_TIME fragment. */
  hasTimeSibling: boolean;
  prefersReducedMotion?: boolean;
}): "time" | "tilt" {
  if (opts.prefersReducedMotion && !opts.isDriven) return "tilt";
  if (opts.hasTimeSibling && opts.isDriven) return "tilt";
  return "time";
}
