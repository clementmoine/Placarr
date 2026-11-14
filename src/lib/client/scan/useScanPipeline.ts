/**
 * Live scan pipeline hook — subject list (Sobel → DocAligner on weak
 * primary + EMA on focus), observations store. UnifiedScanCapture owns UI
 * state and frame cadence; this owns detection + ORT eventing.
 */
"use client";

import { useCallback, useRef } from "react";

import {
  emptyScanObservations,
  patchScanObservations,
  type ScanObservations,
} from "@/core/identify/scanObservations";
import {
  budgetAllowsIdentify,
  inferSlotFree,
  markBarcode,
  markIdentifyComplete,
  releaseInfer,
  tryAcquireInfer,
  type ScanBudgetClock,
} from "@/lib/client/scan/scanBudget";
import { detectCardQuadsFromVideo } from "@/lib/client/scan/cardQuadLive";
import { detectQuadOnnxFromVideo } from "@/lib/client/scan/cardQuadOnnx";
import { isUsableSubject } from "@/lib/client/scan/isUsableSubject";
import {
  orderSubjectsByFocus,
  subjectKeyFromAabb,
} from "@/lib/client/scan/subjectFocus";
import {
  createSubjectQuadEma,
  pushSubjectQuadEma,
  type QuadPoint,
  type SubjectQuadEma,
} from "@/lib/client/scan/subjectQuadEma";
import { getScanRuntime } from "@/lib/client/scan/scanRuntime";
import { mapVideoCornersToObjectCover } from "@/lib/client/scan/scanVisionOverlay";

export type LiveSubjectHit = {
  key: string;
  score: number;
  cornersNorm: QuadPoint[];
  /** Raw TL→TR→BR→BL corners in video pixels — what identify rectifies. */
  cornersVideo: [QuadPoint, QuadPoint, QuadPoint, QuadPoint] | null;
  coverage: number;
  aabb: { left: number; top: number; width: number; height: number };
  source: "classical" | "onnx" | "ema";
  precision: "high" | "low" | "onnx";
  usable: boolean;
};

export type LiveSubjectTick = {
  /** Focus (primary) after ranking / tap promote. */
  primary: LiveSubjectHit | null;
  /** All usable subjects, primary first. */
  subjects: LiveSubjectHit[];
};

export type UseScanPipelineOptions = {
  onObservations?: (obs: ScanObservations) => void;
};

/** A DocAligner quad older than this is stale relative to live classical. */
const ONNX_FRESH_MS = 900;

export function useScanPipeline(opts?: UseScanPipelineOptions) {
  const obsRef = useRef<ScanObservations>(emptyScanObservations());
  // Light EMA only (outlier damping): the drawn frame has its own spring, so
  // a heavier blend here would just add lag on top of lag.
  const emaRef = useRef<SubjectQuadEma>(createSubjectQuadEma(0.6));
  const budgetRef = useRef<ScanBudgetClock>(getScanRuntime().budget);
  const onnxInFlightRef = useRef(false);
  const lastPrimaryRef = useRef<LiveSubjectHit | null>(null);
  const focusKeyRef = useRef<string | null>(null);
  const onObs = opts?.onObservations;

  const publish = useCallback(
    (patch: Parameters<typeof patchScanObservations>[1]) => {
      obsRef.current = patchScanObservations(obsRef.current, patch);
      onObs?.(obsRef.current);
      return obsRef.current;
    },
    [onObs],
  );

  /** Last DocAligner quad (video px) with its timestamp — overrides a
   *  low-precision classical primary while fresh. */
  const onnxRef = useRef<{
    hit: LiveSubjectHit;
    at: number;
  } | null>(null);

  const runDocAligner = useCallback((video: HTMLVideoElement) => {
    const budget = budgetRef.current;
    if (
      onnxInFlightRef.current ||
      !inferSlotFree(budget) ||
      !tryAcquireInfer(budget)
    ) {
      return;
    }
    onnxInFlightRef.current = true;
    void detectQuadOnnxFromVideo(video)
      .then((q) => {
        if (!q) {
          onnxRef.current = null;
          return;
        }
        const xs = q.corners.map((p) => p.x);
        const ys = q.corners.map((p) => p.y);
        const left = Math.min(...xs);
        const top = Math.min(...ys);
        const aabb = {
          left,
          top,
          width: Math.max(...xs) - left,
          height: Math.max(...ys) - top,
        };
        const coverage =
          (aabb.width * aabb.height) /
          Math.max(1, video.videoWidth * video.videoHeight);
        const usable = isUsableSubject({ coverage, aabb, corners: q.corners });
        if (!usable) {
          onnxRef.current = null;
          return;
        }
        const mapped = mapVideoCornersToObjectCover(video, q.corners);
        const key = subjectKeyFromAabb(aabb);
        onnxRef.current = {
          at: Date.now(),
          hit: {
            key,
            score: coverage * 1e6,
            cornersNorm: mapped ?? [],
            cornersVideo: q.corners,
            coverage,
            aabb,
            source: "onnx",
            precision: "onnx",
            usable: true,
          },
        };
      })
      .finally(() => {
        onnxInFlightRef.current = false;
        releaseInfer(budget);
      });
  }, []);

  const promoteFocus = useCallback((key: string) => {
    focusKeyRef.current = key;
  }, []);

  const clearFocus = useCallback(() => {
    focusKeyRef.current = null;
  }, []);

  /**
   * Classical pass (sync). Frame backpressure lives in the video-frame loop;
   * DocAligner fires only when the focus primary is weak/missing and ORT is free.
   */
  const tickSubject = useCallback(
    (video: HTMLVideoElement): LiveSubjectTick => {
      const budget = budgetRef.current;
      const detections = detectCardQuadsFromVideo(video);
      const classicalHits: LiveSubjectHit[] = [];
      for (const detection of detections) {
        const usable = isUsableSubject({
          coverage: detection.coverage,
          aabb: detection.aabb,
          corners: detection.corners,
        });
        if (!usable) continue;
        const mapped = mapVideoCornersToObjectCover(video, detection.corners);
        if (!mapped) continue;
        classicalHits.push({
          key: subjectKeyFromAabb(detection.aabb),
          score: detection.score,
          cornersNorm: mapped,
          cornersVideo: detection.corners,
          coverage: detection.coverage,
          aabb: detection.aabb,
          source: "classical",
          precision: detection.precision,
          usable: true,
        });
      }

      let ordered = orderSubjectsByFocus(classicalHits, focusKeyRef.current);
      // Drop stale promote if the tapped card left the frame.
      if (
        focusKeyRef.current &&
        !ordered.some((s) => s.key === focusKeyRef.current)
      ) {
        focusKeyRef.current = null;
        ordered = orderSubjectsByFocus(classicalHits, null);
      }

      let primary = ordered[0] ?? null;
      const primaryWeak =
        !primary || primary.precision === "low" || !primary.usable;

      // DocAligner: event on weak/miss primary when ORT free — refine
      // primary only (never N heatmaps).
      if (primaryWeak) {
        runDocAligner(video);
      }
      const onnx = onnxRef.current;
      if (primaryWeak && onnx && Date.now() - onnx.at < ONNX_FRESH_MS) {
        const smoothed = pushSubjectQuadEma(
          emaRef.current,
          onnx.hit.cornersNorm.length ? onnx.hit.cornersNorm : null,
        );
        primary = {
          ...onnx.hit,
          cornersNorm: smoothed ?? onnx.hit.cornersNorm,
        };
        ordered = [
          primary,
          ...ordered.filter((s) => s.key !== primary!.key),
        ];
      } else if (primary) {
        const smoothed = pushSubjectQuadEma(
          emaRef.current,
          primary.cornersNorm,
        );
        if (smoothed) {
          primary = { ...primary, cornersNorm: smoothed };
          ordered = [primary, ...ordered.slice(1)];
        }
      } else {
        pushSubjectQuadEma(emaRef.current, null);
      }

      lastPrimaryRef.current = primary;
      publish({
        subject: {
          source: primary
            ? primary.source === "ema"
              ? "classical"
              : primary.source
            : "none",
          cornersNorm: primary?.cornersNorm ?? null,
          coverage: primary?.coverage ?? null,
          usable: primary?.usable ?? false,
        },
        budget: { inferInFlight: budget.inferInFlight },
      });

      return { primary, subjects: ordered };
    },
    [publish, runDocAligner],
  );

  const noteIdentify = useCallback(
    (
      patch: {
        confidence: "sure" | "doubt" | "miss";
        matches: ScanObservations["identify"]["matches"];
        bestEmbedDistance: number | null;
        path: "client" | "server" | "none";
      },
      durationMs?: number,
    ) => {
      if (durationMs != null) {
        markIdentifyComplete(budgetRef.current, durationMs);
      } else {
        markIdentifyComplete(budgetRef.current, budgetRef.current.identifyPaceMs);
      }
      publish({ identify: patch });
    },
    [publish],
  );

  const noteOcr = useCallback(
    (patch: Partial<ScanObservations["ocr"]>) => {
      publish({ ocr: patch });
    },
    [publish],
  );

  const noteBarcode = useCallback(
    (value: string | null, source: "native" | "zxing" | "none") => {
      markBarcode(budgetRef.current);
      publish({ barcode: { value, source } });
    },
    [publish],
  );

  const allowIdentifyTick = useCallback(() => {
    return budgetAllowsIdentify(budgetRef.current);
  }, []);

  return {
    observationsRef: obsRef,
    tickSubject,
    promoteFocus,
    clearFocus,
    noteIdentify,
    noteOcr,
    noteBarcode,
    allowIdentifyTick,
    budget: budgetRef,
  };
}
