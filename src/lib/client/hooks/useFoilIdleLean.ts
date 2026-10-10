"use client";

import { useCallback, useEffect, useRef } from "react";

import { leanFromPointer, type Lean } from "@/core/render/deviceTilt";
import {
  IDLE_RELEASE_MS,
  blendGlare,
  blendLean,
  idleLeanFromSeconds,
  idlePointerFromSeconds,
  subscribeFoilFrame,
} from "@/core/render/foil";

/**
 * Drive a resting card from the shared foil clock, and blend out of a pointer
 * (or device) pose so leaving the card is not a snap.
 *
 * Call {@link noteLean} whenever the pointer/device applies a pose — that is
 * the release origin. When `driven` falls, frames ease from that origin toward
 * the live idle target over {@link IDLE_RELEASE_MS}.
 *
 * `combined` is the CSS `--combined` coordinate. Idle passes a travelling
 * value (not `lightX + lightY`); pointer callers may omit it and let the
 * consumer sum the lights.
 */
export function useFoilIdleLean(
  driven: boolean,
  maxTilt: number,
  onFrame: (lean: Lean, glare: number, combined: number) => void,
): {
  noteLean: (lean: Lean, glare?: number) => void;
} {
  const lastLeanRef = useRef<Lean>(leanFromPointer(50, 50, maxTilt));
  const lastGlareRef = useRef(0);
  const lastCombinedRef = useRef(100);
  const releaseFromLeanRef = useRef<Lean | null>(null);
  const releaseFromGlareRef = useRef(0);
  const releaseFromCombinedRef = useRef(100);
  const releaseAtRef = useRef<number | null>(null);
  const wasDrivenRef = useRef(driven);
  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    onFrameRef.current = onFrame;
  });

  const noteLean = useCallback((lean: Lean, glare = 0.66) => {
    lastLeanRef.current = lean;
    lastGlareRef.current = glare;
    lastCombinedRef.current = lean.lightX + lean.lightY;
  }, []);

  useEffect(() => {
    if (wasDrivenRef.current && !driven) {
      releaseFromLeanRef.current = lastLeanRef.current;
      releaseFromGlareRef.current = lastGlareRef.current;
      releaseFromCombinedRef.current = lastCombinedRef.current;
      releaseAtRef.current = performance.now();
    }
    if (driven) {
      releaseFromLeanRef.current = null;
      releaseAtRef.current = null;
    }
    wasDrivenRef.current = driven;
  }, [driven]);

  useEffect(() => {
    if (driven) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    return subscribeFoilFrame((seconds) => {
      const target = idleLeanFromSeconds(seconds, maxTilt);
      const pointer = idlePointerFromSeconds(seconds);
      const glareTarget = pointer.glare;
      const combinedTarget = pointer.combined;
      let lean = target;
      let glare = glareTarget;
      let combined = combinedTarget;
      const from = releaseFromLeanRef.current;
      const at = releaseAtRef.current;
      if (from && at != null) {
        const t = (performance.now() - at) / IDLE_RELEASE_MS;
        if (t < 1) {
          lean = blendLean(from, target, t);
          glare = blendGlare(releaseFromGlareRef.current, glareTarget, t);
          combined = blendGlare(
            releaseFromCombinedRef.current,
            combinedTarget,
            t,
          );
        } else {
          releaseFromLeanRef.current = null;
          releaseAtRef.current = null;
        }
      }
      lastLeanRef.current = lean;
      lastGlareRef.current = glare;
      lastCombinedRef.current = combined;
      onFrameRef.current(lean, glare, combined);
    });
  }, [driven, maxTilt]);

  return { noteLean };
}
