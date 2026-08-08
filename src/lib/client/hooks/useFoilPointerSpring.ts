"use client";

import { useCallback, useEffect, useRef } from "react";

import { leanFromPointer, type Lean } from "@/core/render/deviceTilt";
import {
  springLean,
  springSettled,
  springStep,
} from "@/core/render/foil/pointerSpring";

type Place = (lean: Lean, glare: number, combined?: number) => void;

/**
 * Soft-follow pointer / device leans into {@link place}. Idle should call
 * {@link snap} so the spring state matches the idle pose (no jump on engage).
 */
export function useFoilPointerSpring(place: Place): {
  setTarget: (lean: Lean, glare: number) => void;
  snap: (lean: Lean, glare: number) => void;
} {
  const currentLean = useRef<Lean>(leanFromPointer(50, 50, 0));
  const currentGlare = useRef(0);
  const targetLean = useRef<Lean>(leanFromPointer(50, 50, 0));
  const targetGlare = useRef(0);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const placeRef = useRef(place);
  placeRef.current = place;

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    lastTsRef.current = 0;
  }, []);

  const tick = useCallback((ts: number) => {
    const dt = lastTsRef.current ? Math.min(48, ts - lastTsRef.current) : 16;
    lastTsRef.current = ts;
    currentLean.current = springLean(
      currentLean.current,
      targetLean.current,
      dt,
    );
    currentGlare.current = springStep(
      currentGlare.current,
      targetGlare.current,
      dt,
    );
    placeRef.current(currentLean.current, currentGlare.current);
    if (
      springSettled(
        currentLean.current,
        targetLean.current,
        currentGlare.current,
        targetGlare.current,
      )
    ) {
      stop();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [stop]);

  const ensureRunning = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const setTarget = useCallback(
    (lean: Lean, glare: number) => {
      targetLean.current = lean;
      targetGlare.current = glare;
      ensureRunning();
    },
    [ensureRunning],
  );

  const snap = useCallback(
    (lean: Lean, glare: number) => {
      stop();
      currentLean.current = lean;
      currentGlare.current = glare;
      targetLean.current = lean;
      targetGlare.current = glare;
    },
    [stop],
  );

  useEffect(() => () => stop(), [stop]);

  return { setTarget, snap };
}
