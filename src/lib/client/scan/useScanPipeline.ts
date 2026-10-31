/**
 * Live scan pipeline hook — budgets, subject (Sobel→DocAligner + EMA),
 * observations store. UnifiedScanCapture owns UI state; this owns cadence.
 */
"use client";

import { useCallback, useRef } from "react";

import {
  emptyScanObservations,
  patchScanObservations,
  type ScanObservations,
} from "@/core/identify/scanObservations";
import {
  budgetAllows,
  markBudget,
  releaseInfer,
  tryAcquireInfer,
  type ScanBudgetClock,
} from "@/lib/client/scan/scanBudget";
import { detectCardQuadFromVideo } from "@/lib/client/scan/cardQuadLive";
import { detectQuadOnnxFromVideo } from "@/lib/client/scan/cardQuadOnnx";
import { isUsableSubject } from "@/lib/client/scan/isUsableSubject";
import {
  createSubjectQuadEma,
  pushSubjectQuadEma,
  type QuadPoint,
  type SubjectQuadEma,
} from "@/lib/client/scan/subjectQuadEma";
import { getScanRuntime } from "@/lib/client/scan/scanRuntime";
import { mapVideoCornersToObjectCover } from "@/lib/client/scan/scanVisionOverlay";

export type LiveSubjectHit = {
  cornersNorm: QuadPoint[];
  /** Raw TL→TR→BR→BL corners in video pixels — what identify rectifies. */
  cornersVideo: [QuadPoint, QuadPoint, QuadPoint, QuadPoint] | null;
  coverage: number;
  aabb: { left: number; top: number; width: number; height: number };
  source: "classical" | "onnx" | "ema";
  usable: boolean;
};

export type UseScanPipelineOptions = {
  onObservations?: (obs: ScanObservations) => void;
};

/** A DocAligner quad older than this is stale at 5 Hz Sobel cadence. */
const ONNX_FRESH_MS = 900;

export function useScanPipeline(opts?: UseScanPipelineOptions) {
  const obsRef = useRef<ScanObservations>(emptyScanObservations());
  const emaRef = useRef<SubjectQuadEma>(createSubjectQuadEma(0.35));
  const budgetRef = useRef<ScanBudgetClock>(getScanRuntime().budget);
  const onnxInFlightRef = useRef(false);
  const lastAabbRef = useRef<LiveSubjectHit["aabb"] | null>(null);
  const lastCornersRef = useRef<LiveSubjectHit["cornersVideo"]>(null);
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
   *  low-precision classical blob while fresh. */
  const onnxRef = useRef<{
    hit: LiveSubjectHit;
    at: number;
  } | null>(null);

  const commitHit = useCallback(
    (
      hit: LiveSubjectHit,
      budgetPatch: Parameters<typeof publish>[0]["budget"],
    ) => {
      lastAabbRef.current = hit.aabb;
      lastCornersRef.current = hit.cornersVideo;
      publish({
        subject: {
          source: hit.source === "ema" ? "classical" : hit.source,
          cornersNorm: hit.cornersNorm,
          coverage: hit.coverage,
          usable: hit.usable,
        },
        budget: budgetPatch,
      });
      return hit;
    },
    [publish],
  );

  const runDocAligner = useCallback((video: HTMLVideoElement) => {
    const budget = budgetRef.current;
    if (
      !budgetAllows(budget, "docAligner") ||
      onnxInFlightRef.current ||
      !tryAcquireInfer(budget)
    ) {
      return;
    }
    markBudget(budget, "docAligner");
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
        const usable = isUsableSubject({ coverage, aabb });
        if (!usable) {
          onnxRef.current = null;
          return;
        }
        const mapped = mapVideoCornersToObjectCover(video, q.corners);
        onnxRef.current = {
          at: Date.now(),
          hit: {
            cornersNorm: mapped ?? [],
            cornersVideo: q.corners,
            coverage,
            aabb,
            source: "onnx",
            usable: true,
          },
        };
      })
      .finally(() => {
        onnxInFlightRef.current = false;
        releaseInfer(budget);
      });
  }, []);

  const tickSubject = useCallback(
    (video: HTMLVideoElement): LiveSubjectHit | null => {
      const budget = budgetRef.current;
      if (!budgetAllows(budget, "sobel")) {
        // Keep last EMA paint without re-running Sobel.
        const corners = emaRef.current.corners;
        if (!corners || !lastAabbRef.current) return null;
        return {
          cornersNorm: corners.map((p) => ({ ...p })),
          cornersVideo: lastCornersRef.current,
          coverage: obsRef.current.subject.coverage ?? 0,
          aabb: lastAabbRef.current,
          source: "ema",
          usable: obsRef.current.subject.usable,
        };
      }
      markBudget(budget, "sobel");

      const detection = detectCardQuadFromVideo(video);
      const classicalUsable =
        !!detection &&
        isUsableSubject({ coverage: detection.coverage, aabb: detection.aabb });
      const budgetPatch = { sobelHz: 5, inferInFlight: budget.inferInFlight };

      // 1. Closed-loop classical quad: exact corners, any tilt, immune to
      //    neighbours cut by the frame — trust it outright.
      if (detection && classicalUsable && detection.precision === "high") {
        const mapped = mapVideoCornersToObjectCover(video, detection.corners);
        const smoothed = pushSubjectQuadEma(emaRef.current, mapped);
        if (!smoothed) return null;
        return commitHit(
          {
            cornersNorm: smoothed,
            cornersVideo: detection.corners,
            coverage: detection.coverage,
            aabb: detection.aabb,
            source: "classical",
            usable: true,
          },
          budgetPatch,
        );
      }

      // 2. No clean loop (busy table, glare-broken border, close-up): ask the
      //    learned corner detector; its fresh answer beats the scanline blob.
      runDocAligner(video);
      const onnx = onnxRef.current;
      if (onnx && Date.now() - onnx.at < ONNX_FRESH_MS) {
        const smoothed = pushSubjectQuadEma(
          emaRef.current,
          onnx.hit.cornersNorm.length ? onnx.hit.cornersNorm : null,
        );
        return commitHit(
          { ...onnx.hit, cornersNorm: smoothed ?? onnx.hit.cornersNorm },
          { ...budgetPatch, docAlignerHz: 2 },
        );
      }

      // 3. Scanline fallback — rough but better than nothing for the ROI.
      if (detection && classicalUsable) {
        const mapped = mapVideoCornersToObjectCover(video, detection.corners);
        const smoothed = pushSubjectQuadEma(emaRef.current, mapped);
        if (!smoothed) return null;
        return commitHit(
          {
            cornersNorm: smoothed,
            cornersVideo: detection.corners,
            coverage: detection.coverage,
            aabb: detection.aabb,
            source: "classical",
            usable: true,
          },
          budgetPatch,
        );
      }

      if (!detection) {
        pushSubjectQuadEma(emaRef.current, null);
        lastAabbRef.current = null;
        lastCornersRef.current = null;
        publish({
          subject: {
            source: "none",
            cornersNorm: null,
            coverage: null,
            usable: false,
          },
        });
      }
      return null;
    },
    [publish, runDocAligner, commitHit],
  );

  const noteIdentify = useCallback(
    (patch: {
      confidence: "sure" | "doubt" | "miss";
      matches: ScanObservations["identify"]["matches"];
      bestEmbedDistance: number | null;
      path: "client" | "server" | "none";
    }) => {
      markBudget(budgetRef.current, "identify");
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
      markBudget(budgetRef.current, "barcode");
      publish({ barcode: { value, source } });
    },
    [publish],
  );

  const allowIdentifyTick = useCallback(() => {
    return budgetAllows(budgetRef.current, "identify");
  }, []);

  return {
    observationsRef: obsRef,
    tickSubject,
    noteIdentify,
    noteOcr,
    noteBarcode,
    allowIdentifyTick,
    budget: budgetRef,
  };
}
