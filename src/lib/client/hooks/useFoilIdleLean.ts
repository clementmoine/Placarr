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
 */
export function useFoilIdleLean(
  driven: boolean,
  maxTilt: number,
  onFrame: (lean: Lean, glare: number) => void,
): {
  noteLean: (lean: Lean, glare?: number) => void;
} {
  const lastLeanRef = useRef<Lean>(leanFromPointer(50, 50, maxTilt));
  const lastGlareRef = useRef(0);
  const releaseFromLeanRef = useRef<Lean | null>(null);
  const releaseFromGlareRef = useRef(0);
  const releaseAtRef = useRef<number | null>(null);
  const wasDrivenRef = useRef(driven);
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  const noteLean = useCallback((lean: Lean, glare = 0.66) => {
    lastLeanRef.current = lean;
    lastGlareRef.current = glare;
  }, []);

  useEffect(() => {
    if (wasDrivenRef.current && !driven) {
      releaseFromLeanRef.current = lastLeanRef.current;
      releaseFromGlareRef.current = lastGlareRef.current;
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
      const glareTarget = idlePointerFromSeconds(seconds).glare;
      let lean = target;
      let glare = glareTarget;
      const from = releaseFromLeanRef.current;
      const at = releaseAtRef.current;
      if (from && at != null) {
        const t = (performance.now() - at) / IDLE_RELEASE_MS;
        if (t < 1) {
          lean = blendLean(from, target, t);
          glare = blendGlare(releaseFromGlareRef.current, glareTarget, t);
        } else {
          releaseFromLeanRef.current = null;
          releaseAtRef.current = null;
        }
      }
      lastLeanRef.current = lean;
      lastGlareRef.current = glare;
      onFrameRef.current(lean, glare);
    });
  }, [driven, maxTilt]);

  return { noteLean };
}
