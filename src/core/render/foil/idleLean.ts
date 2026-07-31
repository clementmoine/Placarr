import { leanFromPointer, type Lean } from "@/core/render/deviceTilt";

/**
 * How long a pointer release blends into the idle sweep. Short enough to feel
 * like settling, long enough that leaving the card is not a snap.
 */
export const IDLE_RELEASE_MS = 420;

/**
 * Idle light as a fake pointer, locked to WebGL Time mode's driver.
 *
 * Unity Time-scroll fragments read `_CosTime.w * _TimeFactor`, and
 * `foilCosTime(t)[3] === cos(t)`. Driving CSS sheen and card lean from the
 * same `cos(t)` makes idle feel like a slow hover on every backend — not a
 * separate breathe animation fighting the foil.
 *
 * The path is the same diagonal `holo-drift` used to paint: when `w` is high
 * the light sits top-right, when low bottom-left.
 */
export function idlePointerFromSeconds(seconds: number): {
  x: number;
  y: number;
  glare: number;
} {
  const w = Math.cos(seconds);
  return {
    x: 50 + w * 28,
    y: 50 - w * 22,
    // Soft glare that peaks mid-sweep — same band as the old `holo-drift`
    // keyframes (0.12 → 0.3), so the pointer still has somewhere to go.
    glare: 0.12 + (1 - Math.abs(w)) * 0.18,
  };
}

/** Lean a resting card would take under {@link idlePointerFromSeconds}. */
export function idleLeanFromSeconds(seconds: number, maxTilt: number): Lean {
  const { x, y } = idlePointerFromSeconds(seconds);
  return leanFromPointer(x, y, maxTilt);
}

/** Ease-out cubic — quick leave, soft settle into idle. */
export function easeOutCubic(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return 1 - (1 - u) ** 3;
}

/** Interpolate two leans by `t` in 0..1 (eased). */
export function blendLean(from: Lean, to: Lean, t: number): Lean {
  const u = easeOutCubic(t);
  return {
    tiltX: from.tiltX + (to.tiltX - from.tiltX) * u,
    tiltY: from.tiltY + (to.tiltY - from.tiltY) * u,
    lightX: from.lightX + (to.lightX - from.lightX) * u,
    lightY: from.lightY + (to.lightY - from.lightY) * u,
  };
}

export function blendGlare(from: number, to: number, t: number): number {
  const u = easeOutCubic(t);
  return from + (to - from) * u;
}
