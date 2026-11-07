import type { Lean } from "@/core/render/deviceTilt";

/**
 * Soft-follow toward a pointer target (simey `spring` feel — exponential
 * approach, not a full Verlet spring). Idle already eases on release; this is
 * for interactive tracking so glare / tilt don't snap to the cursor.
 */

/** Angular frequency-ish rate — higher = snappier. Simey stiffness ≈ 0.066. */
export const POINTER_SPRING_OMEGA = 16;

export function springStep(
  current: number,
  target: number,
  dtMs: number,
  omega: number = POINTER_SPRING_OMEGA,
): number {
  const dt = Math.max(0, dtMs) / 1000;
  const a = 1 - Math.exp(-omega * dt);
  return current + (target - current) * a;
}

export function springLean(
  current: Lean,
  target: Lean,
  dtMs: number,
  omega: number = POINTER_SPRING_OMEGA,
): Lean {
  return {
    tiltX: springStep(current.tiltX, target.tiltX, dtMs, omega),
    tiltY: springStep(current.tiltY, target.tiltY, dtMs, omega),
    lightX: springStep(current.lightX, target.lightX, dtMs, omega),
    lightY: springStep(current.lightY, target.lightY, dtMs, omega),
  };
}

export function springSettled(
  current: Lean,
  target: Lean,
  glare: number,
  glareTarget: number,
  eps = 0.05,
): boolean {
  return (
    Math.abs(current.tiltX - target.tiltX) < eps &&
    Math.abs(current.tiltY - target.tiltY) < eps &&
    Math.abs(current.lightX - target.lightX) < eps &&
    Math.abs(current.lightY - target.lightY) < eps &&
    Math.abs(glare - glareTarget) < eps * 0.02
  );
}
