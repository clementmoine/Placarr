"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

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
 * Margin around the viewport inside which a resting card keeps animating —
 * enough that a card scrolling in is already moving when it appears.
 */
const IDLE_VIEWPORT_MARGIN = "200px";

/**
 * Whether a resting card should draw on the shared clock this frame. Only a
 * card someone can see: subscribed off screen, the ~120 holos of a large grid
 * rewrote their CSS properties every frame and the page dropped to 11fps.
 * The clock is shared, so a card coming back resumes in phase.
 */
export function foilIdleShouldTick(input: {
  driven: boolean;
  reducedMotion: boolean;
  nearViewport: boolean;
}): boolean {
  return !input.driven && !input.reducedMotion && input.nearViewport;
}

/**
 * True while `ref` is within {@link IDLE_VIEWPORT_MARGIN} of the viewport.
 * Without a ref, the card counts as visible — the historical behaviour.
 *
 * The frame often mounts after the first effect (it waits for the mask), so
 * the element is re-checked after every render and observed once it exists;
 * until the observer reports, the card counts as off screen.
 */
function useNearViewport(ref?: RefObject<Element | null>): boolean {
  const [near, setNear] = useState(!ref);
  const observedRef = useRef<Element | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // No deps on purpose: the frame can appear on any render. Cheap — it only
  // re-observes when the element itself changed; state moves in the observer.
  useEffect(() => {
    if (!ref || typeof IntersectionObserver === "undefined") return;
    const element = ref.current;
    if (element === observedRef.current) return;
    observerRef.current?.disconnect();
    observerRef.current = null;
    observedRef.current = element;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => setNear(Boolean(entry?.isIntersecting)),
      { rootMargin: IDLE_VIEWPORT_MARGIN },
    );
    observer.observe(element);
    observerRef.current = observer;
  });

  useEffect(
    () => () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      observedRef.current = null;
    },
    [],
  );
  return near;
}

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
  /** The card's frame: off screen, it stops drawing (see `foilIdleShouldTick`). */
  targetRef?: RefObject<Element | null>,
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
  const nearViewport = useNearViewport(targetRef);
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
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!foilIdleShouldTick({ driven, reducedMotion, nearViewport })) return;
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
  }, [driven, maxTilt, nearViewport]);

  return { noteLean };
}
