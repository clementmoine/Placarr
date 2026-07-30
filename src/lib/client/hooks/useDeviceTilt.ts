"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import { leanFromGravity, type Lean } from "@/core/render/deviceTilt";
import {
  getOrientationSnapshot,
  orientationPermissionPending,
  requestOrientationPermission,
  subscribeToDeviceOrientation,
} from "@/lib/client/deviceOrientationStore";

export type DeviceTilt = {
  /** Latest lean, or `null` while there is no sensor and no permission. */
  lean: Lean | null;
  /** True when the platform will only hand the sensor over after a tap. */
  needsPermission: boolean;
  /** Ask for it. Must be called from a real user gesture, or iOS refuses. */
  requestPermission: () => void;
};

const NO_SUBSCRIPTION = () => () => {};

/**
 * The lean of a card held in the hand, from the phone's own orientation.
 *
 * On a touch screen there is no pointer to follow, so a foil card sat
 * completely still — the effect that exists to be played with could not be.
 * Tilting the phone is the gesture people already make with a real card.
 *
 * Nothing happens on a device without the sensor, which is every desktop, so
 * the pointer path is left alone there rather than competing with it.
 *
 * The sensor itself is read once for the whole page — see
 * `deviceOrientationStore`. `maxTilt` stays per caller, because how far a card
 * leans is a property of that card, not of the phone.
 */
export function useDeviceTilt(maxTilt: number, enabled = true): DeviceTilt {
  const subscribe = useCallback(
    (onChange: () => void) =>
      enabled ? subscribeToDeviceOrientation(onChange) : NO_SUBSCRIPTION(),
    [enabled],
  );

  const snapshot = useSyncExternalStore(
    subscribe,
    getOrientationSnapshot,
    // No sensor during the server render, so the markup matches on arrival.
    () => null,
  );

  /**
   * Whether this platform gates the sensor. Read through the store because a tap
   * on any card's prompt grants it for all of them.
   */
  const gated = useSyncExternalStore(
    subscribe,
    orientationPermissionPending,
    () => false,
  );

  const lean = useMemo(
    () =>
      enabled && snapshot
        ? leanFromGravity(snapshot.gravity, snapshot.baseline, maxTilt)
        : null,
    [enabled, snapshot, maxTilt],
  );

  return {
    lean,
    needsPermission: enabled && gated,
    requestPermission: requestOrientationPermission,
  };
}
