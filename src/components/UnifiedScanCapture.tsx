"use client";

/**
 * Unified live scanner — one MediaStream, always Auto (barcode + card).
 * Lens-minimal chrome: pinch/wheel zoom, no mode switch. Never auto-adds.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Flashlight, FlashlightOff, ImageIcon } from "lucide-react";
import { toast } from "sonner";

import { ScanOverlay, type ScanPhase } from "@/components/scan/ScanOverlay";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import {
  markCameraUnavailable,
  useCameraAvailability,
} from "@/lib/client/hooks/useCameraAvailability";
import { AdaptivePerf } from "@/lib/client/scan/adaptivePerf";
import {
  detectBarcodeHitFromVideo,
  getBarcodeDetectorSource,
  isBarcodeDetectorSupported,
} from "@/lib/client/scan/barcodeFromVideo";
import {
  applyContinuousFocus,
  applyTorch,
  applyZoom,
  getVideoTrack,
  summarizeCameraCapabilities,
  type CameraCapabilitiesSummary,
} from "@/lib/client/scan/cameraControls";
import { detectQuadOnnx } from "@/lib/client/scan/cardQuadOnnx";
import {
  identifyCardBlobClient,
  recognizeCollectorBandClient,
} from "@/lib/client/scan/clientIdentify";
import {
  grabCollectorBandBlob,
  type CollectorBandGrab,
} from "@/lib/client/scan/grabCollectorBand";
import { hapticLong, hapticShort } from "@/lib/client/scan/haptics";
import { grabRectifiedSample } from "@/lib/client/scan/rectifyCardFace";
import {
  bootScanRuntime,
  isScanRuntimeReady,
} from "@/lib/client/scan/scanRuntime";
import {
  useScanPipeline,
  type LiveSubjectHit,
} from "@/lib/client/scan/useScanPipeline";
import {
  nextZoomFromPinch,
  nextZoomFromWheel,
  resolveZoomRange,
  touchDistance,
} from "@/lib/client/scan/pinchZoom";
import {
  evaluateQualityGates,
  looksLikeCardBack,
  type QualityHint,
} from "@/lib/client/scan/qualityGates";
import {
  alignedFrameWeight,
  createAcceptState,
  observeWinner,
  pickAlignedWinner,
  type AcceptState,
} from "@/lib/client/scan/scanAccept";
import {
  getScanDebugSnapshot,
  isScanDebugEnabled,
  patchScanDebug,
  resetScanDebug,
  setScanDebugEnabled,
  subscribeScanDebug,
} from "@/lib/client/scan/scanDebugStore";
import { scanOverlayHint } from "@/lib/client/scan/scanHints";
import { ScanSession, type SessionLock } from "@/lib/client/scan/scanSession";
import {
  mapRoiCornersToObjectCover,
  mapVideoRectToObjectCover,
  type ScanVisionRect,
  type ScanVisionText,
} from "@/lib/client/scan/scanVisionOverlay";
import { SharpestBurst } from "@/lib/client/scan/sharpestBurst";
import { cn } from "@/lib/shared/utils";

/** @deprecated Always Auto — kept for call-site typing during migration. */
export type ScanMode = "auto" | "barcode" | "card";

/**
 * One identify sample: 640 px face thumbnail + native-res collector band,
 * plus the same band taken from the other end of the card (which end carries
 * the collector line is settled by reading them, not assumed).
 */
type IdentifySample = {
  face: Blob;
  band: CollectorBandGrab | null;
  bandHalfTurn: CollectorBandGrab | null;
};

export type CardLiveMatch = {
  printKey: string;
  lang: string;
  distance: number;
  faceUrl?: string | null;
  packId?: string;
  artRel?: string;
  ambiguous?: boolean;
  method?: "embed" | "dhash";
  confidence?: "sure" | "doubt" | "miss";
};

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
    // 1080p: the collector footer is ~8 px tall at 720p on a phone held at
    // arm's length — unreadable by any OCR. Sobel/DocAligner downsample
    // anyway; only the OCR band grab reads these pixels at native size.
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
};

/** Card identify hunt cadence (OCR never blocks this path). */
const SAMPLE_HUNT_MS = 1000; // scanBudget identifyHz = 1
const SAMPLE_STABLE_MS = 1800;
/** Barcode gets its own high-frequency loop — priority over card/OCR. */
const BARCODE_TICK_MS = 125; // ~8 Hz
/** Edge overlay — cheaper than identify; yields while identify flies. */
const VISION_TICK_MS = 200; // ≤5 Hz Sobel budget
const ROI_SIZE = 96;

/** Live DINOv2 hits land ~120–380 milli-dissimilarity (not cosine). */
const EMBED_SCORE_CEILING = 500;

function distanceToScore(distance: number, method?: string): number {
  if (method === "embed") {
    return Math.max(0, Math.min(1, 1 - distance / EMBED_SCORE_CEILING));
  }
  // dHash hammings often 0..40
  return Math.max(0, Math.min(1, 1 - distance / 28));
}

function artKeyOf(printKey: string): string {
  const slash = printKey.indexOf("/");
  if (slash > 0) return printKey.slice(0, slash);
  const hash = printKey.indexOf("#");
  if (hash > 0) return printKey.slice(0, hash);
  return printKey;
}

function publishOcrVision(
  video: HTMLVideoElement,
  words: Array<{
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>,
  preview: string,
  keepBarcode?: ScanVisionRect | null,
  /** Card crop AABB in video pixels — server OCR coords are crop-relative. */
  cropAabb?: VideoRegion | null,
  cropSize?: { width: number; height: number } | null,
): void {
  const overlays: ScanVisionRect[] = [];
  if (keepBarcode) overlays.push(keepBarcode);
  const texts: ScanVisionText[] = [];
  const srcW = cropSize?.width ?? 0;
  const srcH = cropSize?.height ?? 0;
  // Native-band OCR reports words in *frame* pixels (source == video):
  // identity mapping, not crop-relative.
  const frameSpace =
    srcW === video.videoWidth && srcH === video.videoHeight && srcW > 0;
  const aabb = frameSpace
    ? { left: 0, top: 0, width: srcW, height: srcH }
    : cropAabb;
  if (aabb && srcW > 0 && srcH > 0) {
    words.forEach((w, i) => {
      const vx = aabb.left + (w.x / srcW) * aabb.width;
      const vy = aabb.top + (w.y / srcH) * aabb.height;
      const vw = (w.width / srcW) * aabb.width;
      const vh = (w.height / srcH) * aabb.height;
      if (vw <= 0 || vh <= 0) return;
      if (vw > aabb.width * 0.9 || vh > aabb.height * 0.2) return;
      const mapped = mapVideoRectToObjectCover(video, {
        x: vx,
        y: vy,
        width: vw,
        height: vh,
      });
      if (!mapped) return;
      if (mapped.w > 0.45 || mapped.h > 0.12) return;
      texts.push({
        id: `ocr-${i}-${w.text}`,
        text: w.text,
        ...mapped,
      });
    });
  }
  patchScanDebug({
    overlays,
    texts,
    ocrPreview: preview.slice(0, 48),
  });
}

function clearCardVisionOverlays(keepBarcode?: ScanVisionRect | null): void {
  patchScanDebug({
    texts: [],
    ocrPreview: "",
    overlays: keepBarcode ? [keepBarcode] : [],
    quadSource: keepBarcode ? "none" : getScanDebugSnapshot().quadSource,
  });
}

type VideoRegion = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Only crop to a live AABB when it looks like a stable card window. */
function aabbSafeForIdentifyCrop(
  region: VideoRegion,
  videoW: number,
  videoH: number,
): boolean {
  if (region.width < 64 || region.height < 64) return false;
  const ar = region.width / region.height;
  // Portrait card ~0.72; reject wildly skewed classical blobs.
  if (ar < 0.55 || ar > 0.9) return false;
  const frac = (region.width * region.height) / (videoW * videoH);
  // Match live overlay gate (~0.78 coverage) so a painted quad can be cropped.
  if (frac < 0.08 || frac > 0.78) return false;
  return true;
}

/**
 * Grab a JPEG for identify. Crop to live AABB only when it is card-shaped;
 * a bad classical blob (common on purple/dark arts) poisons the embed — prefer
 * full-frame + server dewarp/card_live in that case.
 */
async function grabFinderBlob(
  video: HTMLVideoElement,
  region?: VideoRegion | null,
): Promise<Blob | null> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;

  let sx = 0;
  let sy = 0;
  let sw = width;
  let sh = height;
  if (region && aabbSafeForIdentifyCrop(region, width, height)) {
    const padX = region.width * 0.06;
    const padY = region.height * 0.06;
    sx = Math.max(0, Math.floor(region.left - padX));
    sy = Math.max(0, Math.floor(region.top - padY));
    const ex = Math.min(width, Math.ceil(region.left + region.width + padX));
    const ey = Math.min(height, Math.ceil(region.top + region.height + padY));
    sw = Math.max(48, ex - sx);
    sh = Math.max(48, ey - sy);
  }

  const maxEdge = 640;
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, dw, dh);
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.88),
  );
}

/**
 * Card ROI for quality gates. Prefer the live-detected AABB so gates match
 * what we crop for identify — the fixed center guide was gating on empty
 * table while the green "card" overlay already locked the real object.
 */
function sampleCardRoi(
  video: HTMLVideoElement,
  region?: VideoRegion | null,
): {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  sourceEdgePx: number;
} | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  let left: number;
  let top: number;
  let guideW: number;
  let guideH: number;
  if (region && region.width >= 48 && region.height >= 48) {
    left = region.left;
    top = region.top;
    guideW = region.width;
    guideH = region.height;
  } else {
    guideW = vw * 0.78;
    guideH = guideW / (63 / 88);
    left = (vw - guideW) / 2;
    top = (vh - guideH) / 2;
  }

  const canvas = document.createElement("canvas");
  canvas.width = ROI_SIZE;
  canvas.height = ROI_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, left, top, guideW, guideH, 0, 0, ROI_SIZE, ROI_SIZE);
  const image = ctx.getImageData(0, 0, ROI_SIZE, ROI_SIZE);
  return {
    data: image.data,
    width: ROI_SIZE,
    height: ROI_SIZE,
    sourceEdgePx: Math.max(guideW, guideH),
  };
}

export function UnifiedScanCapture({
  active = true,
  onBatchDone,
  cameraClassName,
}: {
  active?: boolean;
  /** Finish the live session — parent reviews / commits the tray. */
  onBatchDone: (locks: SessionLock[]) => void;
  cameraClassName?: string;
}) {
  const { t, locale } = useLocale();
  const { isCameraUnavailable, isCheckingCamera } = useCameraAvailability();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraShellRef = useRef<HTMLDivElement | null>(null);
  const inFlightRef = useRef(false);
  const genRef = useRef(0);
  const acceptRef = useRef<AcceptState>(createAcceptState());
  const frameRef = useRef(0);
  const aimStartedRef = useRef<number | null>(null);
  const sessionRef = useRef(new ScanSession());
  const adaptiveRef = useRef(new AdaptivePerf());
  const burstRef = useRef(new SharpestBurst<IdentifySample>({ windowMs: 300 }));
  const backoffUntilRef = useRef(0);
  const fpsTimesRef = useRef<number[]>([]);
  const zoomRef = useRef(1);
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(
    null,
  );
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barcodeOverlayRef = useRef<ScanVisionRect | null>(null);
  const barcodeSeenAtRef = useRef(0);
  const lastCardAabbRef = useRef<VideoRegion | null>(null);
  /** Raw video-pixel corners of the live card — identify rectifies these. */
  const lastCardCornersRef = useRef<LiveSubjectHit["cornersVideo"]>(null);
  const onnxGenRef = useRef(0);

  const { tickSubject, noteIdentify, noteOcr, noteBarcode, allowIdentifyTick } =
    useScanPipeline();

  const [live, setLive] = useState(false);
  const [starting, setStarting] = useState(false);
  /** On-device engines (ORT / OCR / DINOv2) — not the camera permission. */
  const [enginesReady, setEnginesReady] = useState(() => isScanRuntimeReady());
  const enginesReadyRef = useRef(enginesReady);
  const [sampling, setSampling] = useState(false);
  const [phase, setPhase] = useState<ScanPhase>("looking");
  const [gateHint, setGateHint] = useState<QualityHint>("ok");
  const [identifyMiss, setIdentifyMiss] = useState(false);
  const [matches, setMatches] = useState<CardLiveMatch[]>([]);
  const [stable, setStable] = useState<CardLiveMatch | null>(null);
  const [sessionLocks, setSessionLocks] = useState<SessionLock[]>([]);
  const [torchOn, setTorchOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [caps, setCaps] = useState<CameraCapabilitiesSummary>({
    torch: false,
    zoom: false,
    zoomMin: 1,
    zoomMax: 1,
    zoomStep: 0.1,
    focusMode: false,
  });
  const [barcodePaused, setBarcodePaused] = useState(false);
  /** Lens layout: camera-first vs results sheet (scan keeps running either way). */
  const [panel, setPanel] = useState<"camera" | "results">("camera");
  const [quadNorm, setQuadNorm] = useState<Array<{
    x: number;
    y: number;
  }> | null>(null);
  const matchesFpRef = useRef("");

  zoomRef.current = zoom;

  const debugEnabled = useSyncExternalStore(
    subscribeScanDebug,
    isScanDebugEnabled,
    () => false,
  );

  const stopStream = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setLive(false);
    setTorchOn(false);
  }, []);

  useEffect(() => {
    if (!active || isCameraUnavailable || isCheckingCamera) {
      stopStream();
      return;
    }
    let cancelled = false;
    setStarting(true);
    void (async () => {
      try {
        const stream =
          await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        const track = getVideoTrack(stream);
        setCaps(summarizeCameraCapabilities(track));
        if (track) {
          void applyContinuousFocus(track);
        }
        setLive(true);
      } catch (error) {
        if (!cancelled) {
          markCameraUnavailable();
          toast.error(t("scanner.error"));
          console.warn("[UnifiedScanCapture] camera", error);
        }
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [active, isCameraUnavailable, isCheckingCamera, stopStream, t]);

  useEffect(() => {
    if (!active) {
      resetScanDebug();
      acceptRef.current = createAcceptState();
      adaptiveRef.current.reset();
      sessionRef.current.clear();
      setSessionLocks([]);
      setMatches([]);
      setStable(null);
      setPhase("looking");
      setBarcodePaused(false);
      aimStartedRef.current = null;
    }
  }, [active]);

  const recordSessionLock = useCallback(
    (
      kind: "barcode" | "card",
      key: string,
      label: string,
      faceUrl?: string | null,
      opts?: { force?: boolean },
    ) => {
      const entry = sessionRef.current.tryLock(
        kind,
        key,
        label,
        faceUrl,
        Date.now(),
        opts,
      );
      if (entry) {
        setSessionLocks([...sessionRef.current.list()]);
        hapticLong();
      }
      return entry;
    },
    [],
  );

  const handleBarcodeValue = useCallback(
    (raw: string) => {
      if (sessionRef.current.isCoolingDown("barcode", raw)) return;
      if (!recordSessionLock("barcode", raw, raw)) return;
      setPhase("delivering");
      setBarcodePaused(true);
      patchScanDebug({ phase: "delivering", confidence: "barcode" });
      // Keep scanning — short pause so the same code isn't re-queued instantly.
      window.setTimeout(() => {
        setBarcodePaused(false);
        setPhase("looking");
      }, 700);
    },
    [recordSessionLock],
  );

  const commitCardToSession = useCallback(
    (printKey: string) => {
      const row =
        matches.find((m) => m.printKey === printKey) ?? matches[0] ?? null;
      if (!row) return;
      // Explicit tap always records a copy — cooldown only blocks auto-locks.
      if (
        !recordSessionLock("card", row.printKey, row.printKey, row.faceUrl, {
          force: true,
        })
      ) {
        return;
      }
      toast.success(t("scanner.addedKeepScanning"));
      setMatches([]);
      setStable(null);
      setIdentifyMiss(false);
      setPanel("camera");
      setPhase("looking");
      acceptRef.current = createAcceptState();
    },
    [matches, recordSessionLock, t],
  );

  const undoSessionLock = useCallback((id: string) => {
    if (!sessionRef.current.remove(id)) return;
    setSessionLocks([...sessionRef.current.list()]);
    hapticShort();
  }, []);

  const finishBatch = useCallback(() => {
    const locks = [...sessionRef.current.list()];
    if (!locks.length) return;
    onBatchDone(locks);
  }, [onBatchDone]);

  const applyCardMatches = useCallback(
    (
      next: CardLiveMatch[],
      confidence: "sure" | "doubt" | "miss",
      frame: number,
    ) => {
      setIdentifyMiss(confidence === "miss");
      setMatches(next);
      const scores = next.map((m) => ({
        key: m.printKey,
        score: distanceToScore(m.distance, m.method),
      }));
      const decision = pickAlignedWinner(scores, artKeyOf);
      const margin = decision.winner
        ? decision.winner.score - decision.winner.rivalScore
        : 0;

      if (confidence !== "sure" || !decision.winner || decision.refused) {
        setStable(null);
        setPhase(next.length ? "understanding" : "looking");
        patchScanDebug({
          phase: next.length ? "understanding" : "looking",
          margin,
          runWeight: 0,
          confidence,
          method: next[0]?.method ?? "",
        });
        return;
      }

      const weight = alignedFrameWeight(decision.winner);
      const locked = observeWinner(
        acceptRef.current,
        frame,
        Date.now() / 1000,
        decision.winner,
        undefined,
        { weight },
      );
      const track = acceptRef.current.get(decision.winner.artKey);
      patchScanDebug({
        phase: locked ? "delivering" : "understanding",
        margin,
        runWeight: track?.runWeight ?? weight,
        confidence,
        method: next[0]?.method ?? "",
      });

      if (locked) {
        const top =
          next.find((m) => m.printKey === locked.key) ?? next[0] ?? null;
        if (top && !sessionRef.current.isCoolingDown("card", top.printKey)) {
          const aimMs =
            aimStartedRef.current != null
              ? Date.now() - aimStartedRef.current
              : null;
          patchScanDebug({ aimToLockMs: aimMs, phase: "delivering" });
          // Multi-frame sure → stage in session tray (not shelf). Keep hunting.
          recordSessionLock("card", top.printKey, top.printKey, top.faceUrl);
          setStable(null);
          setMatches([]);
          setPanel("camera");
          setPhase("looking");
          acceptRef.current = createAcceptState();
          aimStartedRef.current = null;
          return;
        }
      }
      setStable(null);
      setPhase("understanding");
    },
    [recordSessionLock],
  );

  const identifyBlob = useCallback(
    async (sample: IdentifySample, generation: number, frame: number) => {
      const started = performance.now();
      const { face: blob, band, bandHalfTurn } = sample;

      // OCR stage: native-res collector band (same frame as the face). Its
      // text feeds client identify *and* the server fallback.
      const ocr = await recognizeCollectorBandClient(blob, band, bandHalfTurn);
      const ocrDone = performance.now();
      if (generation !== genRef.current) return;

      // Full-client path first; server only if WASM/models/shards can't finish.
      try {
        const client = await identifyCardBlobClient(blob, { ocr });
        patchScanDebug({
          ocrMs: Math.round(ocrDone - started),
          embedMs: Math.round(performance.now() - ocrDone),
        });
        if (client && generation === genRef.current) {
          adaptiveRef.current.recordIdentifyMs(performance.now() - started);
          noteOcr({
            text: client.ocrText,
            engine: client.ocrEngine,
            status:
              client.ocrStatus === "ok"
                ? "ok"
                : client.ocrStatus === "empty"
                  ? "empty"
                  : "unavailable",
            words: client.ocrWords,
          });
          noteIdentify({
            confidence: client.confidence,
            matches: client.matches.map((m) => ({
              printKey: m.printKey,
              distance: m.distance,
              method: "embed",
              packId: m.packId,
            })),
            bestEmbedDistance: client.bestEmbedDistance,
            path: "client",
          });
          patchScanDebug({
            bestEmbedDistance: client.bestEmbedDistance,
            bestEmbedKey: client.bestEmbedKey ?? "",
            ocrPreview: client.ocrText.slice(0, 48) || client.ocrStatus,
          });
          if (videoRef.current) {
            publishOcrVision(
              videoRef.current,
              client.ocrWords,
              client.ocrText || client.ocrStatus,
              barcodeOverlayRef.current,
              lastCardAabbRef.current,
              client.ocrSourceWidth && client.ocrSourceHeight
                ? {
                    width: client.ocrSourceWidth,
                    height: client.ocrSourceHeight,
                  }
                : null,
            );
          }
          backoffUntilRef.current = 0;
          applyCardMatches(client.matches, client.confidence, frame);
          if (!client.matches.length) {
            patchScanDebug({
              confidence: client.confidence,
              method: "client-embed",
              phase: "looking",
            });
          }
          return;
        }
      } catch {
        /* fall through to server fallback */
      }

      const body = new FormData();
      body.set(
        "image",
        new File([blob], `card-live-${Date.now()}.jpg`, {
          type: "image/jpeg",
        }),
      );
      body.set("lang", locale);
      body.set("fallback", "1");
      if (ocr.text) body.set("ocrText", ocr.text);
      let response: Response;
      try {
        response = await fetch("/api/identify/card-image?fallback=1", {
          method: "POST",
          body,
          // Dead/hung server must not freeze the live identify loop (iOS
          // "plantage" with missing thumbs while the tab stays up).
          signal: AbortSignal.timeout(8_000),
        });
      } catch {
        if (generation !== genRef.current) return;
        setPhase("looking");
        return;
      }
      adaptiveRef.current.recordIdentifyMs(performance.now() - started);
      if (generation !== genRef.current) return;
      const data = (await response.json()) as {
        matches?: CardLiveMatch[];
        confidence?: "sure" | "doubt" | "miss";
        method?: string;
        abstain?: string;
        bestEmbedDistance?: number | null;
        bestDhashDistance?: number | null;
        bestEmbedKey?: string | null;
        ocrText?: string | null;
        ocrStatus?: string | null;
        ocrEngine?: string | null;
        ocrSourceWidth?: number | null;
        ocrSourceHeight?: number | null;
        ocrWords?: Array<{
          text: string;
          x: number;
          y: number;
          width: number;
          height: number;
        }>;
      };
      noteIdentify({
        confidence:
          data.confidence ?? (data.matches?.length ? "doubt" : "miss"),
        matches: (data.matches ?? []).map((m) => ({
          printKey: m.printKey,
          distance: m.distance,
          method: m.method === "dhash" ? "dhash" : "embed",
          packId: m.packId,
        })),
        bestEmbedDistance:
          typeof data.bestEmbedDistance === "number"
            ? data.bestEmbedDistance
            : null,
        path: "server",
      });
      noteOcr({
        text: data.ocrText ?? "",
        engine: "ppocr-server",
        status: data.ocrStatus === "ok" ? "ok" : data.ocrText ? "ok" : "empty",
        words: data.ocrWords ?? [],
      });
      patchScanDebug({
        bestEmbedDistance:
          typeof data.bestEmbedDistance === "number"
            ? data.bestEmbedDistance
            : null,
        bestDhashDistance:
          typeof data.bestDhashDistance === "number"
            ? data.bestDhashDistance
            : null,
        bestEmbedKey: data.bestEmbedKey ?? "",
        ocrPreview:
          data.ocrText?.slice(0, 48) ||
          (data.ocrStatus && data.ocrStatus !== "ok" ? data.ocrStatus : ""),
      });
      if (videoRef.current) {
        publishOcrVision(
          videoRef.current,
          data.ocrWords ?? [],
          data.ocrText ||
            (data.ocrStatus && data.ocrStatus !== "ok" ? data.ocrStatus : ""),
          barcodeOverlayRef.current,
          lastCardAabbRef.current,
          data.ocrSourceWidth && data.ocrSourceHeight
            ? {
                width: data.ocrSourceWidth,
                height: data.ocrSourceHeight,
              }
            : null,
        );
      }
      if (!response.ok) {
        if (response.status === 429) {
          const retryRaw = response.headers.get("Retry-After");
          const retrySec = Math.max(5, Number(retryRaw) || 30);
          backoffUntilRef.current = Date.now() + retrySec * 1000;
          toast.error(t("scanner.cardRateLimited"));
        } else if (response.status >= 500) {
          toast.error(t("scanner.error"));
        }
        return;
      }
      backoffUntilRef.current = 0;
      const confidence =
        data.confidence ?? (data.matches?.length ? "doubt" : "miss");
      applyCardMatches(data.matches ?? [], confidence, frame);
      if (!data.matches?.length) {
        patchScanDebug({
          confidence,
          method: data.method ?? data.abstain ?? "",
          phase: "looking",
        });
      }
    },
    [applyCardMatches, locale, noteIdentify, noteOcr, t],
  );

  /** Continuous vision overlay — budgets + EMA via useScanPipeline. */
  const updateLiveVision = useCallback(() => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    if (inFlightRef.current) return;

    const barcodeFresh = Date.now() - barcodeSeenAtRef.current < 2500;
    if (barcodeOverlayRef.current || barcodeFresh) {
      setQuadNorm(null);
      lastCardAabbRef.current = null;
      lastCardCornersRef.current = null;
      return;
    }

    const hit = tickSubject(video);
    if (hit?.usable && hit.aabb.width > 0) {
      lastCardAabbRef.current = hit.aabb;
      lastCardCornersRef.current = hit.cornersVideo;
      setQuadNorm(hit.cornersNorm);
      patchScanDebug({
        quadSource:
          hit.source === "classical"
            ? "classical"
            : hit.source === "onnx"
              ? "onnx"
              : "classical",
      });
      return;
    }
    if (hit?.cornersNorm?.length) {
      setQuadNorm(hit.cornersNorm);
      return;
    }
    if (!hit) {
      lastCardAabbRef.current = null;
      lastCardCornersRef.current = null;
      setQuadNorm(null);
      if (!barcodeOverlayRef.current) {
        clearCardVisionOverlays(null);
      }
      patchScanDebug({ quadSource: "none" });
    }
  }, [tickSubject]);

  /**
   * One identify sample. `force` is the user's tap: an explicit "now" that
   * skips the energy throttle and server backoff (never the in-flight guard).
   */
  const runCardSample = useCallback(
    async (opts?: { force?: boolean }) => {
      const video = videoRef.current;
      if (!video || inFlightRef.current) return;
      // Wait for the preparing screen to clear — no silent server thrash.
      if (!enginesReadyRef.current) return;
      if (!opts?.force) {
        if (Date.now() < backoffUntilRef.current) return;
        if (!allowIdentifyTick()) return;
      }

      const detectedRegion = lastCardAabbRef.current;
      const detectedCorners = lastCardCornersRef.current;
      const roi = sampleCardRoi(video, detectedRegion);
      if (!roi) return;

      // A flat/desaturated ROI is often the shared pack sleeve — but unique
      // versos (leaders, morphs) look the same to this heuristic and must
      // still go through identify. "Retournez" is only shown when identify
      // misses (scanHints + identifyMiss).
      const maybeBack = looksLikeCardBack(roi);
      if (maybeBack) {
        setGateHint("card_back");
        patchScanDebug({ gateHint: "card_back" });
      }

      const quality = evaluateQualityGates(roi);
      // Strong live edge hit → don't refuse identify on soft blur/glare gates;
      // the AABB crop is what the embed sees, and waiting for a perfect center-guide
      // pass was the "green box / no match" stall.
      const hardFail =
        quality.hint === "too_dark" ||
        quality.hint === "empty" ||
        quality.hint === "too_far" ||
        quality.hint === "too_small";
      const allowIdentify =
        quality.ok || (Boolean(detectedRegion) && !hardFail);

      setGateHint(allowIdentify ? "ok" : quality.hint);
      patchScanDebug({
        gateHint: allowIdentify ? "ok" : quality.hint,
        blurVariance: quality.blurVariance,
        meanLuminance: quality.meanLuminance,
        glareFraction: quality.glareFraction,
      });
      adaptiveRef.current.noteAim(allowIdentify);
      const profile = adaptiveRef.current.profile();
      patchScanDebug({
        meanIdentifyMs: Math.round(profile.meanIdentifyMs),
        idleBackoff: profile.idleBackoffMs > 0,
      });

      if (!allowIdentify) {
        setIdentifyMiss(false);
        setPhase("looking");
        return;
      }

      if (aimStartedRef.current == null) aimStartedRef.current = Date.now();
      setIdentifyMiss(false);
      setPhase((p) => (p === "delivering" ? p : "understanding"));

      // Optional ONNX corners override classical when DocAligner is enabled.
      void detectQuadOnnx(roi.data, roi.width, roi.height).then((q) => {
        if (!q) return;
        patchScanDebug({ quadSource: "onnx" });
        const mapped = mapRoiCornersToObjectCover(video, q.corners, roi.width);
        if (mapped) setQuadNorm(mapped);
      });

      inFlightRef.current = true;
      setSampling(true);
      const generation = ++genRef.current;
      const frame = ++frameRef.current;
      try {
        // Rectify the live quad when it looks like one card (any tilt); the
        // AABB crop is only the fallback for a missing / implausible quad.
        const rectified = detectedCorners
          ? await grabRectifiedSample(video, detectedCorners)
          : null;
        const [blob, band, bandHalfTurn] = rectified
          ? [rectified.face.blob, rectified.band, rectified.bandHalfTurn]
          : [
              ...(await Promise.all([
                grabFinderBlob(video, detectedRegion),
                grabCollectorBandBlob(video, detectedRegion),
              ])),
              null,
            ];
        patchScanDebug({ faceCrop: rectified ? "rectified" : "aabb" });
        if (!blob || generation !== genRef.current) return;

        burstRef.current.open();
        const maybe = burstRef.current.push(
          { face: blob, band, bandHalfTurn },
          quality.blurVariance,
        );
        const chosen = maybe ?? burstRef.current.close();
        if (!chosen || generation !== genRef.current) return;
        await identifyBlob(chosen.payload, generation, frame);
      } catch {
        /* soft */
      } finally {
        inFlightRef.current = false;
        if (generation === genRef.current) setSampling(false);
      }
    },
    [allowIdentifyTick, identifyBlob],
  );

  // Warm the on-device stack as soon as the scanner opens — not after the
  // camera permission round-trip. Fail open so a download glitch never
  // traps the user on the preparing screen.
  useEffect(() => {
    if (!active) return;
    if (isScanRuntimeReady()) {
      enginesReadyRef.current = true;
      setEnginesReady(true);
      return;
    }
    enginesReadyRef.current = false;
    setEnginesReady(false);
    let cancelled = false;
    void bootScanRuntime([])
      .catch(() => null)
      .then(() => {
        if (cancelled) return;
        enginesReadyRef.current = true;
        setEnginesReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  // Vision overlay (Sobel ≤5 Hz + DocAligner ≤2 Hz + EMA). Yields during identify.
  useEffect(() => {
    if (!active || !live) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const now = performance.now();
      fpsTimesRef.current.push(now);
      fpsTimesRef.current = fpsTimesRef.current.filter((t0) => now - t0 < 1000);
      patchScanDebug({ fps: fpsTimesRef.current.length });
      try {
        updateLiveVision();
      } catch {
        /* soft */
      }
      timer = setTimeout(tick, VISION_TICK_MS);
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [active, live, updateLiveVision]);

  // Barcode — dedicated high-frequency loop. Never blocked by tap-to-scan / OCR.
  useEffect(() => {
    if (!active || !live || barcodePaused) return;
    if (!isBarcodeDetectorSupported()) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const schedule = (ms: number) => {
      if (cancelled) return;
      timer = setTimeout(() => void tick(), ms);
    };

    const tick = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (!video?.videoWidth) {
        schedule(BARCODE_TICK_MS);
        return;
      }
      try {
        const hit = await detectBarcodeHitFromVideo(video);
        if (cancelled) return;
        if (hit) {
          let barcodeOverlay: ScanVisionRect | null = null;
          if (hit.box) {
            const mapped = mapVideoRectToObjectCover(video, hit.box);
            if (mapped) {
              barcodeOverlay = {
                id: "barcode",
                label: `barcode · ${hit.value}`,
                ...mapped,
                tone: "barcode",
              };
            }
          } else {
            barcodeOverlay = {
              id: "barcode",
              label: `barcode · ${hit.value}`,
              x: 0.14,
              y: 0.42,
              w: 0.72,
              h: 0.16,
              tone: "barcode",
            };
          }
          barcodeOverlayRef.current = barcodeOverlay;
          barcodeSeenAtRef.current = Date.now();
          onnxGenRef.current += 1;
          setQuadNorm(null);
          clearCardVisionOverlays(barcodeOverlay);
          setIdentifyMiss(false);
          // Pause card identify briefly so we don't race the same frame.
          genRef.current += 1;
          inFlightRef.current = false;
          noteBarcode(hit.value, getBarcodeDetectorSource());
          handleBarcodeValue(hit.value);
          schedule(SAMPLE_STABLE_MS);
          return;
        }
        if (barcodeOverlayRef.current) {
          barcodeOverlayRef.current = null;
          const snap = getScanDebugSnapshot();
          patchScanDebug({
            overlays: snap.overlays.filter((o) => o.id !== "barcode"),
          });
        }
      } catch {
        /* soft */
      }
      schedule(BARCODE_TICK_MS);
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [active, live, barcodePaused, handleBarcodeValue, noteBarcode]);

  // Card identify loop — image only. OCR hint is attached from background ref.
  useEffect(() => {
    if (!active || !live) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const schedule = (ms: number) => {
      if (cancelled) return;
      timer = setTimeout(() => void tick(), ms);
    };

    const tick = async () => {
      if (cancelled) return;

      // Fresh barcode lock → skip card for a beat.
      if (Date.now() - barcodeSeenAtRef.current < 900) {
        schedule(SAMPLE_HUNT_MS);
        return;
      }

      // Continuous, whatever the device: the next sample starts as soon as
      // this one is done, paced from its *start* so a fast phone tops out at
      // the identify budget and a slow one runs back-to-back (no tap mode).
      const startedAt = Date.now();
      await runCardSample();

      const idle = adaptiveRef.current.profile().idleBackoffMs;
      const target = stable ? SAMPLE_STABLE_MS : SAMPLE_HUNT_MS + idle;
      schedule(Math.max(0, target - (Date.now() - startedAt)));
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      genRef.current += 1;
      inFlightRef.current = false;
    };
  }, [active, live, runCardSample, stable]);

  const identifyFile = useCallback(
    async (file: File) => {
      setSampling(true);
      const generation = ++genRef.current;
      acceptRef.current = createAcceptState();
      try {
        // Server PP-OCR on collector band — no client Tesseract.
        const body = new FormData();
        body.set("image", file);
        body.set("source", "gallery");
        body.set("lang", locale);
        const response = await fetch("/api/identify/card-image", {
          method: "POST",
          body,
        });
        if (generation !== genRef.current) return;
        const data = (await response.json()) as {
          matches?: CardLiveMatch[];
          confidence?: "sure" | "doubt" | "miss";
          ocrText?: string | null;
        };
        if (!response.ok) {
          toast.error(
            response.status === 429
              ? t("scanner.cardRateLimited")
              : t("scanner.error"),
          );
          return;
        }
        if (data.ocrText) {
          patchScanDebug({ ocrPreview: data.ocrText.slice(0, 48) });
        }
        const next = data.matches ?? [];
        const confidence = data.confidence ?? "doubt";
        applyCardMatches(next, confidence, ++frameRef.current);
        if (confidence === "sure" && next[0]) {
          setStable(next[0]);
          setPhase("delivering");
        } else if (!next.length) {
          toast.message(t("scanner.cardNoMatches"));
        }
      } catch {
        toast.error(t("scanner.error"));
      } finally {
        if (generation === genRef.current) setSampling(false);
      }
    },
    [applyCardMatches, locale, t],
  );

  const toggleTorch = useCallback(async () => {
    const track = getVideoTrack(streamRef.current);
    if (!track) return;
    const next = !torchOn;
    const ok = await applyTorch(track, next);
    if (ok) {
      setTorchOn(next);
      hapticShort();
    }
  }, [torchOn]);

  const zoomRange = resolveZoomRange(caps);

  const setZoomClamped = useCallback(
    async (value: number) => {
      const clamped = Math.min(zoomRange.max, Math.max(zoomRange.min, value));
      if (zoomRange.mode === "native") {
        const track = getVideoTrack(streamRef.current);
        if (!track) return;
        if (!(await applyZoom(track, clamped))) return;
      }
      zoomRef.current = clamped;
      setZoom(clamped);
    },
    [zoomRange.max, zoomRange.min, zoomRange.mode],
  );

  // Pinch + wheel zoom (native track or CSS digital fallback).
  useEffect(() => {
    const el = cameraShellRef.current;
    if (!el) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      void setZoomClamped(
        nextZoomFromWheel(zoomRef.current, event.deltaY, {
          min: zoomRange.min,
          max: zoomRange.max,
          step: zoomRange.step,
        }),
      );
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) {
        pinchRef.current = null;
        return;
      }
      pinchRef.current = {
        startDist: touchDistance(event.touches[0]!, event.touches[1]!),
        startZoom: zoomRef.current,
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 2 || !pinchRef.current) return;
      event.preventDefault();
      const dist = touchDistance(event.touches[0]!, event.touches[1]!);
      void setZoomClamped(
        nextZoomFromPinch(
          pinchRef.current.startZoom,
          pinchRef.current.startDist,
          dist,
          { min: zoomRange.min, max: zoomRange.max },
        ),
      );
    };

    const onTouchEnd = () => {
      pinchRef.current = null;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [setZoomClamped, zoomRange.max, zoomRange.min, zoomRange.step]);

  const showCamera = active && !isCameraUnavailable && !isCheckingCamera;
  const hasCardMatches = matches.length > 0;
  const resultsOpen = hasCardMatches && panel === "results";
  const cameraCompact = resultsOpen;

  const matchesFp = matches.map((m) => m.printKey).join("|");
  useEffect(() => {
    if (!hasCardMatches) {
      matchesFpRef.current = "";
      setPanel("camera");
      return;
    }
    if (matchesFp && matchesFp !== matchesFpRef.current) {
      matchesFpRef.current = matchesFp;
      setPanel("results");
    }
  }, [hasCardMatches, matchesFp]);

  const overlayHint = scanOverlayHint(
    t,
    gateHint,
    phase,
    "auto",
    identifyMiss,
    hasCardMatches,
  );

  const expandCamera = useCallback(() => {
    setPanel("camera");
  }, []);

  const openResults = useCallback(() => {
    if (hasCardMatches) setPanel("results");
  }, [hasCardMatches]);

  const clearLongPress = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  const startDebugLongPress = useCallback(() => {
    clearLongPress();
    longPressRef.current = setTimeout(() => {
      setScanDebugEnabled(!isScanDebugEnabled());
      hapticShort();
    }, 900);
  }, [clearLongPress]);

  const cameraShellClass = cn(
    "relative overflow-hidden bg-black touch-none transition-[flex-basis,min-height,max-height] duration-300 ease-out",
    cameraClassName,
    cameraCompact
      ? "shrink-0 basis-[28vh] min-h-[140px] max-h-[220px] cursor-pointer"
      : // Full remaining dialog height on open — no artificial 42vh floor that
        // left a dead band under the viewfinder before the first match.
        "flex-1 min-h-0 basis-auto",
  );

  return (
    <div className="flex flex-col h-full min-h-0 bg-black text-white">
      {showCamera ? (
        <div
          ref={cameraShellRef}
          className={cameraShellClass}
          onClick={cameraCompact ? expandCamera : undefined}
          role={cameraCompact ? "button" : undefined}
          tabIndex={cameraCompact ? 0 : undefined}
          onKeyDown={
            cameraCompact
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") expandCamera();
                }
              : undefined
          }
          onPointerDown={cameraCompact ? undefined : startDebugLongPress}
          onPointerUp={clearLongPress}
          onPointerLeave={clearLongPress}
          onPointerCancel={clearLongPress}
          aria-label={cameraCompact ? t("scanner.expandCamera") : undefined}
        >
          <video
            ref={videoRef}
            className="absolute inset-0 size-full object-cover origin-center will-change-transform"
            style={
              zoomRange.mode === "digital" && zoom > 1
                ? { transform: `scale(${zoom})` }
                : undefined
            }
            playsInline
            muted
            autoPlay
          />
          {(starting || !live || !enginesReady) && (
            <div
              className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center"
              role="status"
              aria-live="polite"
              data-preparing={
                !starting && live && !enginesReady ? "engines" : "camera"
              }
            >
              <span
                className="inline-flex items-center gap-1.5"
                aria-hidden="true"
              >
                <span className="size-1.5 rounded-full bg-white/90 motion-safe:animate-pulse" />
                <span
                  className="size-1.5 rounded-full bg-white/90 motion-safe:animate-pulse"
                  style={{ animationDelay: "140ms" }}
                />
                <span
                  className="size-1.5 rounded-full bg-white/90 motion-safe:animate-pulse"
                  style={{ animationDelay: "280ms" }}
                />
              </span>
              <p className="text-xs text-white/75 leading-snug">
                {starting || !live
                  ? t("scanner.cardCameraStarting")
                  : t("scanner.enginesPreparing")}
              </p>
            </div>
          )}
          {cameraCompact ? (
            <div className="absolute inset-0 z-10 pointer-events-none bg-gradient-to-t from-black/55 via-transparent to-transparent flex items-end justify-center pb-2.5">
              <span className="text-[10px] font-medium text-white/80">
                {t("scanner.expandCamera")}
              </span>
            </div>
          ) : enginesReady ? (
            <ScanOverlay
              mode="auto"
              phase={phase}
              hint={overlayHint}
              quadNorm={quadNorm}
              sampling={sampling}
              onTap={() => void runCardSample({ force: true })}
            />
          ) : null}

          <div
            className="absolute inset-x-3 z-30 flex items-start justify-between pointer-events-none top-[max(0.75rem,env(safe-area-inset-top))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pointer-events-auto flex gap-2">
              {caps.torch ? (
                <button
                  type="button"
                  onClick={() => void toggleTorch()}
                  className="size-9 rounded-full bg-black/40 backdrop-blur-sm text-white flex items-center justify-center cursor-pointer"
                  aria-label={t("scanner.torch")}
                >
                  {torchOn ? (
                    <Flashlight className="size-4" />
                  ) : (
                    <FlashlightOff className="size-4" />
                  )}
                </button>
              ) : null}
            </div>
            <label className="pointer-events-auto size-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center cursor-pointer">
              <ImageIcon className="size-4 text-white/90" />
              <span className="sr-only">{t("scanner.cardPickPhoto")}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  event.target.value = "";
                  if (file) void identifyFile(file);
                }}
              />
            </label>
          </div>

          {debugEnabled ? (
            <div className="absolute top-14 left-3 z-30 text-[9px] font-mono text-emerald-300/90 pointer-events-none">
              z={zoom.toFixed(2)}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-white/60 px-6 text-center">
          {t("scanner.error")}
        </div>
      )}

      {hasCardMatches && panel === "camera" ? (
        <button
          type="button"
          onClick={openResults}
          className="shrink-0 mx-4 mt-3 mb-2 h-11 rounded-full bg-white text-zinc-950 text-sm font-semibold cursor-pointer"
        >
          {t("scanner.resultsPeek", { count: matches.length })}
        </button>
      ) : null}

      {resultsOpen ? (
        <div className="flex-1 min-h-0 flex flex-col bg-background text-foreground rounded-t-3xl overflow-hidden">
          <button
            type="button"
            className="w-full pt-3 pb-2 shrink-0 cursor-pointer"
            onClick={expandCamera}
            aria-label={t("scanner.expandCamera")}
          >
            <div className="mx-auto h-1 w-10 rounded-full bg-border" />
          </button>
          <div className="px-4 pb-2 shrink-0">
            <p className="text-xs text-muted-foreground">
              {stable || (matches.length === 1 && !matches[0]?.ambiguous)
                ? t("scanner.cardConfirmHint")
                : matches.length > 1 || matches.some((m) => m.ambiguous)
                  ? t("scanner.cardDoubtHint")
                  : t("scanner.cardSearching")}
            </p>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-3">
            <div
              className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="list"
              aria-label={t("scanner.cardCarouselLabel")}
            >
              {matches.map((row, index) => {
                const suggestedKey = stable?.printKey ?? matches[0]?.printKey;
                const isBest = row.printKey === suggestedKey;
                return (
                  <button
                    key={`${row.printKey}:${row.lang}:${index}`}
                    type="button"
                    role="listitem"
                    onClick={() => commitCardToSession(row.printKey)}
                    className={cn(
                      "snap-center shrink-0 w-[108px] rounded-2xl border bg-card overflow-hidden text-left cursor-pointer",
                      isBest
                        ? "border-primary ring-2 ring-primary/35"
                        : "border-border",
                    )}
                  >
                    <div className="aspect-[63/88] bg-muted relative">
                      {row.faceUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.faceUrl}
                          alt={row.printKey}
                          className="absolute inset-0 size-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            // iOS paints a blue "?" on a broken img — hide it
                            // and leave the muted tile (printKey sits below).
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground p-2 text-center">
                          {row.printKey}
                        </div>
                      )}
                    </div>
                    <div className="px-2 py-1.5">
                      <p className="text-[10px] font-bold truncate leading-tight">
                        {row.printKey}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
            {matches[0] ? (
              <button
                type="button"
                onClick={() => commitCardToSession(matches[0]!.printKey)}
                className="w-full h-12 rounded-2xl text-sm font-bold bg-primary text-primary-foreground cursor-pointer"
              >
                {t("scanner.cardConfirm")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {sessionLocks.length > 0 ? (
        <div className="shrink-0 border-t border-white/10 bg-black/90 px-3 py-3 space-y-2">
          <div className="flex gap-2 overflow-x-auto">
            {sessionLocks.slice(0, 12).map((lock) => (
              <button
                key={lock.id}
                type="button"
                onClick={() => undoSessionLock(lock.id)}
                className="shrink-0 rounded-full bg-white/10 hover:bg-white/15 px-3 py-1.5 text-[10px] max-w-[140px] truncate text-white/90 cursor-pointer"
                title={t("scanner.sessionUndo")}
              >
                {lock.label} ×
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={finishBatch}
            className="w-full h-11 rounded-2xl text-sm font-bold bg-white text-zinc-950 cursor-pointer"
          >
            {t("scanner.sessionDone", { count: sessionLocks.length })}
          </button>
        </div>
      ) : null}
    </div>
  );
}
