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
import {
  mapVideoCornersToObjectCover,
} from "@/lib/client/scan/scanVisionOverlay";

export type LiveSubjectHit = {
  cornersNorm: QuadPoint[];
  coverage: number;
  aabb: { left: number; top: number; width: number; height: number };
  source: "classical" | "onnx" | "ema";
  usable: boolean;
};

export type UseScanPipelineOptions = {
  onObservations?: (obs: ScanObservations) => void;
};

export function useScanPipeline(opts?: UseScanPipelineOptions) {
  const obsRef = useRef<ScanObservations>(emptyScanObservations());
  const emaRef = useRef<SubjectQuadEma>(createSubjectQuadEma(0.35));
  const budgetRef = useRef<ScanBudgetClock>(getScanRuntime().budget);
  const onnxInFlightRef = useRef(false);
  const lastAabbRef = useRef<LiveSubjectHit["aabb"] | null>(null);
  const onObs = opts?.onObservations;

  const publish = useCallback(
    (patch: Parameters<typeof patchScanObservations>[1]) => {
      obsRef.current = patchScanObservations(obsRef.current, patch);
      onObs?.(obsRef.current);
      return obsRef.current;
    },
    [onObs],
  );

  const tickSubject = useCallback(
    (video: HTMLVideoElement): LiveSubjectHit | null => {
      const budget = budgetRef.current;
      if (!budgetAllows(budget, "sobel")) {
        // Keep last EMA paint without re-running Sobel.
        const corners = emaRef.current.corners;
        if (!corners || !lastAabbRef.current) return null;
        return {
          cornersNorm: corners.map((p) => ({ ...p })),
          coverage: obsRef.current.subject.coverage ?? 0,
          aabb: lastAabbRef.current,
          source: "ema",
          usable: obsRef.current.subject.usable,
        };
      }
      markBudget(budget, "sobel");

      const detection = detectCardQuadFromVideo(video);
      const usable = isUsableSubject(
        detection
          ? { coverage: detection.coverage, aabb: detection.aabb }
          : null,
      );

      if (detection && usable) {
        const mapped = mapVideoCornersToObjectCover(video, detection.corners);
        const smoothed = pushSubjectQuadEma(emaRef.current, mapped);
        if (!smoothed) return null;
        lastAabbRef.current = detection.aabb;
        publish({
          subject: {
            source: "classical",
            cornersNorm: smoothed,
            coverage: detection.coverage,
            usable: true,
          },
          budget: { sobelHz: 5, inferInFlight: budget.inferInFlight },
        });
        return {
          cornersNorm: smoothed,
          coverage: detection.coverage,
          aabb: detection.aabb,
          source: "classical",
          usable: true,
        };
      }

      // Sobel miss → DocAligner, budgeted.
      if (
        budgetAllows(budget, "docAligner") &&
        !onnxInFlightRef.current &&
        tryAcquireInfer(budget)
      ) {
        markBudget(budget, "docAligner");
        onnxInFlightRef.current = true;
        void detectQuadOnnxFromVideo(video)
          .then((q) => {
            if (!q) {
              pushSubjectQuadEma(emaRef.current, null);
              publish({
                subject: {
                  source: "none",
                  cornersNorm: null,
                  coverage: null,
                  usable: false,
                },
              });
              return;
            }
            const xs = q.corners.map((p) => p.x);
            const ys = q.corners.map((p) => p.y);
            const left = Math.min(...xs);
            const top = Math.min(...ys);
            const right = Math.max(...xs);
            const bottom = Math.max(...ys);
            const aabb = {
              left,
              top,
              width: right - left,
              height: bottom - top,
            };
            const coverage =
              (aabb.width * aabb.height) /
              Math.max(1, video.videoWidth * video.videoHeight);
            const mapped = mapVideoCornersToObjectCover(video, q.corners);
            const smoothed = pushSubjectQuadEma(emaRef.current, mapped);
            const ok = isUsableSubject({ coverage, aabb });
            if (ok) lastAabbRef.current = aabb;
            publish({
              subject: {
                source: "onnx",
                cornersNorm: smoothed,
                coverage,
                usable: ok,
              },
              budget: {
                docAlignerHz: 2,
                inferInFlight: budget.inferInFlight,
              },
            });
          })
          .finally(() => {
            onnxInFlightRef.current = false;
            releaseInfer(budget);
          });
      }

      if (!detection) {
        pushSubjectQuadEma(emaRef.current, null);
        lastAabbRef.current = null;
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
    [publish],
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
