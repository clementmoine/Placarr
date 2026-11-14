"use client";

import {
  gravityFromOrientation,
  deviceCanProvideOrientationTilt,
  orientationNeedsPermission,
  smoothGravity,
  type GravityVector,
  type OrientationReading,
} from "@/core/render/deviceTilt";

/**
 * The device's orientation, read once and shared.
 *
 * A phone has one orientation, so listening per component was accidental: two
 * cards on screen meant two listeners, two smoothing passes and — the part that
 * actually broke — two separate ideas of whether iOS had granted the sensor.
 * Permission is a fact about the browser, not about a component, so a tap on one
 * card's prompt has to enable every card.
 *
 * It also fixes the baseline. Whatever angle the phone was at when the first
 * card appeared is "flat" for all of them, so two cards on screen cannot
 * disagree about which way is up.
 */

/**
 * How much of each new reading to take. Low enough that a phone resting on a
 * table stops moving, high enough that the card still follows the wrist.
 */
const SMOOTHING = 0.18;

export type OrientationSnapshot = {
  /** Smoothed direction of gravity in the device's frame. */
  gravity: GravityVector;
  /** How the phone was held when the first reading arrived. */
  baseline: GravityVector;
  /**
   * Compass heading in degrees (`DeviceOrientationEvent.alpha`), or `null`
   * when the sensor does not report one. Fed to Unity as `_DeviceRotationDegrees`.
   */
  alpha: number | null;
};

let snapshot: OrientationSnapshot | null = null;
let smoothed: GravityVector | null = null;
let baseline: GravityVector | null = null;
let alpha: number | null = null;
let granted = false;
/**
 * Opt-in. A phone can tilt, but the card stays on its idle sheen until the
 * viewer turns motion on — and can turn it back off.
 */
let motionEnabled = false;
const listeners = new Set<() => void>();
let detach: (() => void) | null = null;

function announce() {
  for (const listener of listeners) listener();
}

function handleReading(reading: OrientationReading) {
  const gravity = gravityFromOrientation(reading);
  if (!gravity) return;

  smoothed = smoothGravity(smoothed, gravity, SMOOTHING);
  if (baseline) {
    const dx = smoothed.x - baseline.x;
    const dy = smoothed.y - baseline.y;
    const dz = smoothed.z - baseline.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // Un vrai saut d'axes (changement d'orientation) donne une distance
    // proche de 2 ; un simple tilt maximal reste sous ~1.5.
    if (dist > 1.8) baseline = smoothed;
  } else {
    baseline = smoothed;
  }
  if (reading.alpha != null && Number.isFinite(reading.alpha)) {
    // Same light smoothing as gravity — raw compass jumps make varnish bevels twitch.
    alpha =
      alpha == null
        ? reading.alpha
        : alpha + (reading.alpha - alpha) * SMOOTHING;
  }
  // A fresh object per reading, the same object between them: that identity is
  // what `useSyncExternalStore` uses to decide whether anything happened.
  snapshot = { gravity: smoothed, baseline, alpha };
  announce();
}

/** @internal exposed so the reading path can be tested without a device. */
export function pushOrientationReading(reading: OrientationReading): void {
  handleReading(reading);
}

function listen() {
  if (detach) return;
  if (typeof window === "undefined") return;
  if (!("DeviceOrientationEvent" in window)) return;

  const onOrientation = (event: DeviceOrientationEvent) => handleReading(event);
  window.addEventListener("deviceorientation", onOrientation);
  detach = () => window.removeEventListener("deviceorientation", onOrientation);
}

export function subscribeToDeviceOrientation(listener: () => void): () => void {
  listeners.add(listener);
  listen();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      detach?.();
      detach = null;
    }
  };
}

export function resetOrientationBaseline(): void {
  if (!smoothed) return;
  baseline = smoothed;
  if (snapshot) {
    snapshot = { ...snapshot, baseline };
    announce();
  }
}

export function getOrientationSnapshot(): OrientationSnapshot | null {
  return snapshot;
}

/** Whether this device can drive a tilt at all (phone / tablet, not a desktop). */
export function orientationTiltAvailable(): boolean {
  return deviceCanProvideOrientationTilt();
}

/** Whether the viewer has asked the card to follow the handset. */
export function isOrientationMotionEnabled(): boolean {
  return motionEnabled;
}

/**
 * Turn motion on or off.
 *
 * The first enable on iOS is the permission gesture: the sensor is only
 * granted from a tap, so that tap both asks and switches motion on. Later
 * taps only flip the switch. Turning it on also recaptures "flat" from
 * however the phone is held right now.
 */
export function toggleOrientationMotion(): void {
  if (typeof window === "undefined") return;
  if (!deviceCanProvideOrientationTilt()) return;

  const needsAsk =
    !granted && orientationNeedsPermission(window.DeviceOrientationEvent);
  if (!motionEnabled && needsAsk) {
    requestOrientationPermission();
    return;
  }

  motionEnabled = !motionEnabled;
  if (motionEnabled) resetOrientationBaseline();
  announce();
}

/**
 * Whether this browser still has to be asked — and only when the device can
 * actually drive tilt (not desktop WebKit’s empty `requestPermission`).
 */
export function orientationPermissionPending(): boolean {
  if (typeof window === "undefined") return false;
  if (!deviceCanProvideOrientationTilt()) return false;
  return !granted && orientationNeedsPermission(window.DeviceOrientationEvent);
}

export function requestOrientationPermission(): void {
  if (typeof window === "undefined") return;
  const eventClass = window.DeviceOrientationEvent;
  if (!orientationNeedsPermission(eventClass)) return;

  void eventClass
    .requestPermission()
    .then((response) => {
      if (response !== "granted") return;
      granted = true;
      motionEnabled = true;
      resetOrientationBaseline();
      // Readings only start now, and every card that was waiting on the tap has
      // to hear about it — not just the one whose prompt was tapped.
      announce();
    })
    .catch(() => {
      // Refused, or called outside a gesture. The pointer path still works.
    });
}

/** @internal test hook. */
export function resetDeviceOrientationStore(): void {
  snapshot = null;
  smoothed = null;
  baseline = null;
  alpha = null;
  granted = false;
  motionEnabled = false;
  listeners.clear();
  detach?.();
  detach = null;
}
