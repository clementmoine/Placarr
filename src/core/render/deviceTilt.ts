/**
 * Turning a phone's orientation into the lean of a card held in the hand.
 *
 * Kept separate from the listener so the arithmetic — where every mistake in
 * this feature lives — can be tested without a device.
 */

/** A device orientation reading, in degrees, as the browser reports it. */
export type OrientationReading = {
  /**
   * Compass heading, 0..360. The app feeds this into `_DeviceRotationDegrees`
   * (foil bevels rotate with how the phone faces the room). Null on desktop.
   */
  alpha?: number | null;
  /** Front-to-back tilt, -180..180. */
  beta: number | null;
  /** Left-to-right tilt, -90..90. */
  gamma: number | null;
};

/** Which way down is, from the device's point of view. */
export type GravityVector = { x: number; y: number; z: number };

/**
 * How far the card leans, and where the light sits.
 *
 * `tiltX` and `tiltY` are named for the axis they *rotate about*, not the input
 * that drives them, and the pairing is crossed: moving sideways turns the card
 * about its vertical axis. Getting that backwards is silent — the card still
 * moves, it just leans into the pointer instead of away from it — so it is
 * pinned by tests rather than left to reading.
 */
export type Lean = {
  tiltX: number;
  tiltY: number;
  lightX: number;
  lightY: number;
};

const DEGREES_TO_RADIANS = Math.PI / 180;

/**
 * Where gravity points, in the device's own frame.
 *
 * Going through a vector rather than using `beta` and `gamma` directly is the
 * whole point: those two are Euler angles, and they degenerate when the phone
 * is held upright — `gamma` flips through its whole range for a tiny real
 * movement, and the card would snap end to end. A direction has no such seam.
 */
export function gravityFromOrientation(
  reading: OrientationReading,
): GravityVector | null {
  const { beta, gamma } = reading;
  if (beta == null || gamma == null) return null;
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return null;

  const b = beta * DEGREES_TO_RADIANS;
  const g = gamma * DEGREES_TO_RADIANS;

  return {
    x: -Math.cos(b) * Math.sin(g),
    y: -Math.sin(b),
    z: -Math.cos(b) * Math.cos(g),
  };
}

/**
 * Blend a new reading into the previous one.
 *
 * Raw orientation is noisy enough that a card sitting on a table visibly
 * jitters. `weight` is how much of the new reading to take: small is smooth
 * and laggy, large is responsive and twitchy.
 */
export function smoothGravity(
  previous: GravityVector | null,
  next: GravityVector,
  weight: number,
): GravityVector {
  if (!previous) return next;
  const w = Math.min(1, Math.max(0, weight));
  return {
    x: previous.x + (next.x - previous.x) * w,
    y: previous.y + (next.y - previous.y) * w,
    z: previous.z + (next.z - previous.z) * w,
  };
}

/**
 * Lean, relative to however the phone happened to be held at the start.
 *
 * The first reading becomes the neutral position rather than assuming the
 * device is flat: nobody holds a phone at zero degrees, and without this the
 * card starts already tipped over and can never come back to rest.
 */
export function leanFromGravity(
  gravity: GravityVector,
  baseline: GravityVector,
  maxTilt: number,
): Lean {
  const clamp = (value: number) => Math.min(1, Math.max(-1, value));
  // Sideways gravity turns the card around its vertical axis, and vice versa —
  // the same pairing the pointer uses, so both inputs feel like one gesture.
  const sideways = clamp(gravity.x - baseline.x);
  const forward = clamp(gravity.y - baseline.y);

  return {
    tiltY: sideways * maxTilt,
    tiltX: -forward * maxTilt,
    // Where the light sits, as a percentage across the card. Centre is 50.
    lightX: 50 + sideways * 50,
    lightY: 50 + forward * 50,
  };
}

/**
 * Whether this browser will hand over orientation only after being asked.
 *
 * iOS 13 made the sensor opt-in behind a call that must come from a user
 * gesture, so the effect cannot simply start listening — something has to be
 * tapped first, and only on that platform.
 */
export function orientationNeedsPermission(
  eventClass: unknown,
): eventClass is { requestPermission: () => Promise<string> } {
  return (
    typeof eventClass === "function" &&
    typeof (eventClass as { requestPermission?: unknown }).requestPermission ===
      "function"
  );
}

/**
 * The lean a pointer at (x, y) should produce, both as percentages of the card.
 *
 * Shares its shape with {@link leanFromGravity} so the pointer and the phone
 * hand the renderer the same thing. The card leans *away* from the pointer, the
 * way one tips under a finger.
 */
export function leanFromPointer(x: number, y: number, maxTilt: number): Lean {
  const clamp = (value: number) => Math.min(100, Math.max(0, value));
  const px = clamp(x);
  const py = clamp(y);
  return {
    tiltY: ((px - 50) / 50) * maxTilt,
    tiltX: ((py - 50) / 50) * -maxTilt,
    lightX: px,
    lightY: py,
  };
}
