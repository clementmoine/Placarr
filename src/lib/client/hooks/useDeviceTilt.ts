"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  gravityFromOrientation,
  leanFromGravity,
  orientationNeedsPermission,
  smoothGravity,
  type GravityVector,
  type Lean,
} from "@/core/render/deviceTilt";

/**
 * How much of each new reading to take. Low enough that a phone resting on a
 * table stops moving, high enough that the card still follows the wrist.
 */
const SMOOTHING = 0.18;

export type DeviceTilt = {
  /** Latest lean, or `null` while there is no sensor and no permission. */
  lean: Lean | null;
  /** True when the platform will only hand the sensor over after a tap. */
  needsPermission: boolean;
  /** Ask for it. Must be called from a real user gesture, or iOS refuses. */
  requestPermission: () => void;
};

/**
 * The lean of a card held in the hand, from the phone's own orientation.
 *
 * On a touch screen there is no pointer to follow, so a foil card sat
 * completely still — the effect that exists to be played with could not be.
 * Tilting the phone is the gesture people already make with a real card.
 *
 * Nothing happens on a device without the sensor, which is every desktop, so
 * the pointer path is left alone there rather than competing with it.
 */
export function useDeviceTilt(maxTilt: number, enabled = true): DeviceTilt {
  const [lean, setLean] = useState<Lean | null>(null);
  const [granted, setGranted] = useState(false);

  /**
   * Whether this platform gates the sensor. Read through the store rather than
   * an effect: it is a browser fact, not a consequence of rendering, and the
   * server has to answer "no" so the markup matches on arrival.
   */
  const gated = useSyncExternalStore(
    () => () => {},
    () => orientationNeedsPermission(window.DeviceOrientationEvent),
    () => false,
  );
  const needsPermission = enabled && gated && !granted;

  // Held in refs, not state: readings arrive many times a second and none of
  // them should cost a React render on their own.
  const smoothed = useRef<GravityVector | null>(null);
  const baseline = useRef<GravityVector | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("DeviceOrientationEvent" in window)) return;
    // Asking is itself a decision the user has to make, so only surface it once
    // something actually wants the tilt.
    if (!enabled) return;
    // Nothing arrives until the platform has been asked, and asking has to come
    // from a tap — see `requestPermission`.
    if (needsPermission) return;

    const onOrientation = (event: DeviceOrientationEvent) => {
      const gravity = gravityFromOrientation(event);
      if (!gravity) return;

      smoothed.current = smoothGravity(smoothed.current, gravity, SMOOTHING);
      // Whatever angle the phone was at when the card appeared becomes flat.
      baseline.current ??= smoothed.current;
      setLean(leanFromGravity(smoothed.current, baseline.current, maxTilt));
    };

    window.addEventListener("deviceorientation", onOrientation);
    return () => window.removeEventListener("deviceorientation", onOrientation);
  }, [enabled, needsPermission, maxTilt]);

  const requestPermission = useCallback(() => {
    const eventClass = window.DeviceOrientationEvent;
    if (!orientationNeedsPermission(eventClass)) return;
    void eventClass
      .requestPermission()
      .then((response) => {
        if (response === "granted") setGranted(true);
      })
      .catch(() => {
        // Refused, or called outside a gesture. The pointer path still works.
      });
  }, []);

  return { lean, needsPermission, requestPermission };
}
