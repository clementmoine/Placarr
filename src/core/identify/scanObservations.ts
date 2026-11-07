/**
 * Unified live-scan observations (client HUD + identify finalize).
 *
 * Honest miss OK — never invent a confident lock from empty evidence.
 */

export type ScanQuadSource = "classical" | "onnx" | "ema" | "none";

export type ScanSubjectObservation = {
  source: ScanQuadSource;
  /** Normalized corners in object-cover space (0..1), TL→TR→BR→BL. */
  cornersNorm: Array<{ x: number; y: number }> | null;
  coverage: number | null;
  usable: boolean;
};

export type ScanOcrObservation = {
  text: string;
  engine: "ppocr-client" | "ppocr-server" | "tesseract" | "none";
  status: "ok" | "empty" | "timeout" | "unavailable" | "skipped";
  words: Array<{
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    confidence?: number;
  }>;
};

export type ScanMatchObservation = {
  printKey: string;
  distance: number;
  method: "embed" | "dhash";
  packId?: string;
};

export type ScanIdentifyObservation = {
  confidence: "sure" | "doubt" | "miss";
  matches: ScanMatchObservation[];
  bestEmbedDistance: number | null;
  path: "client" | "server" | "none";
};

export type ScanBarcodeObservation = {
  value: string | null;
  source: "native" | "zxing" | "none";
};

export type ScanObservations = {
  updatedAt: number;
  subject: ScanSubjectObservation;
  ocr: ScanOcrObservation;
  identify: ScanIdentifyObservation;
  barcode: ScanBarcodeObservation;
  /** Budget / energy debug. */
  budget: {
    sobelHz: number;
    docAlignerHz: number;
    identifyHz: number;
    inferInFlight: number;
  };
};

export function emptyScanObservations(
  now: number = Date.now(),
): ScanObservations {
  return {
    updatedAt: now,
    subject: {
      source: "none",
      cornersNorm: null,
      coverage: null,
      usable: false,
    },
    ocr: {
      text: "",
      engine: "none",
      status: "skipped",
      words: [],
    },
    identify: {
      confidence: "miss",
      matches: [],
      bestEmbedDistance: null,
      path: "none",
    },
    barcode: { value: null, source: "none" },
    budget: {
      sobelHz: 0,
      docAlignerHz: 0,
      identifyHz: 0,
      inferInFlight: 0,
    },
  };
}

export function patchScanObservations(
  prev: ScanObservations,
  patch: Partial<{
    subject: Partial<ScanSubjectObservation>;
    ocr: Partial<ScanOcrObservation>;
    identify: Partial<ScanIdentifyObservation>;
    barcode: Partial<ScanBarcodeObservation>;
    budget: Partial<ScanObservations["budget"]>;
  }>,
  now: number = Date.now(),
): ScanObservations {
  return {
    updatedAt: now,
    subject: { ...prev.subject, ...(patch.subject ?? {}) },
    ocr: {
      ...prev.ocr,
      ...(patch.ocr ?? {}),
      words: patch.ocr?.words ?? prev.ocr.words,
    },
    identify: {
      ...prev.identify,
      ...(patch.identify ?? {}),
      matches: patch.identify?.matches ?? prev.identify.matches,
    },
    barcode: { ...prev.barcode, ...(patch.barcode ?? {}) },
    budget: { ...prev.budget, ...(patch.budget ?? {}) },
  };
}
