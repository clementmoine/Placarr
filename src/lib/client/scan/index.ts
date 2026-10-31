export * from "@/lib/client/scan/scanAccept";
export * from "@/lib/client/scan/qualityGates";
export * from "@/lib/client/scan/sharpestBurst";
export * from "@/lib/client/scan/scanSession";
export * from "@/lib/client/scan/cameraControls";
export * from "@/lib/client/scan/haptics";
export * from "@/lib/client/scan/scanDebugStore";
export * from "@/lib/client/scan/adaptivePerf";
export * from "@/lib/client/scan/scanHints";
export * from "@/lib/client/scan/pinchZoom";
export * from "@/lib/client/scan/scanBudget";
export * from "@/lib/client/scan/isUsableSubject";
export * from "@/lib/client/scan/subjectQuadEma";
export * from "@/lib/client/scan/clientScanFlags";
export {
  COLLECTOR_OCR_LANGS,
  collectorBandRect,
  cropCollectorBandBlob,
  isPlausibleCollectorWord,
  prefetchCollectorOcr,
  recognizeCollectorOcr,
  recognizeCollectorOcrDetailed,
  recognizeCollectorOcrFromVideoRegion,
  resetCollectorOcrWorker,
  type CollectorOcrResult,
  type OcrWordBox,
} from "@/lib/client/scan/collectorOcr";
export {
  prefetchPaddleCollectorOcrClient,
  recognizeCollectorOcrClient,
  resetPaddleCollectorOcrClient,
  type PreCroppedBand,
} from "@/lib/client/scan/paddleCollectorOcr.client";
export {
  collectorBandForVideo,
  grabCollectorBandBlob,
  type CollectorBandGrab,
} from "@/lib/client/scan/grabCollectorBand";
export {
  detectBarcodeFromVideo,
  detectBarcodeHitFromVideo,
  getBarcodeDetectorSource,
  isBarcodeDetectorSupported,
  type BarcodeHit,
  type BarcodeDetectorSource,
} from "@/lib/client/scan/barcodeFromVideo";
export { bootScanRuntime, getScanRuntime } from "@/lib/client/scan/scanRuntime";
export { useScanPipeline } from "@/lib/client/scan/useScanPipeline";
export {
  identifyCardBlobClient,
  prefetchClientIdentify,
  recognizeCollectorBandClient,
  type ClientOcrOutcome,
} from "@/lib/client/scan/clientIdentify";
export {
  CARD_FACE_RATIO,
  CARD_GUIDE_WIDTH_FRAC,
  CARD_LIVE_WIDTH_FRAC,
  mapRoiCornersToObjectCover,
  mapVideoCornersToObjectCover,
  mapVideoPointToObjectCover,
  mapVideoRectToObjectCover,
  ocrBandNorm,
  ocrBandWithinCard,
  type ScanVisionRect,
  type ScanVisionText,
  type ScanVisionTone,
} from "@/lib/client/scan/scanVisionOverlay";
export {
  detectCardQuadFromVideo,
  type LiveCardDetection,
} from "@/lib/client/scan/cardQuadLive";
export {
  detectQuadOnnx,
  detectQuadOnnxFromVideo,
  prefetchDocAligner,
  DEFAULT_DOCALIGNER_URL,
  resetDocAlignerSession,
  type OnnxQuadResult,
} from "@/lib/client/scan/cardQuadOnnx";
