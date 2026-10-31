/**
 * Hard energy budgets for the live scan stack (phone-first).
 *
 * One infer in-flight in the worker; OCR+embed only on a committed frame.
 */

export const SCAN_BUDGET = {
  /** Classical Sobel / edge quad. */
  sobelHz: 5,
  /** DocAligner ONNX — only after Sobel miss. */
  docAlignerHz: 2,
  /** OCR + embed hunt after gate + sharpest burst. */
  identifyHz: 1,
  /** Native / ZXing barcode loop. */
  barcodeHz: 8,
  /** At most one ONNX/transformers infer across the scan worker. */
  maxInferInFlight: 1,
} as const;

export type ScanBudgetKind = keyof typeof SCAN_BUDGET;

const MIN_INTERVAL_MS: Record<
  "sobel" | "docAligner" | "identify" | "barcode",
  number
> = {
  sobel: 1000 / SCAN_BUDGET.sobelHz,
  docAligner: 1000 / SCAN_BUDGET.docAlignerHz,
  identify: 1000 / SCAN_BUDGET.identifyHz,
  barcode: 1000 / SCAN_BUDGET.barcodeHz,
};

export type ScanBudgetClock = {
  lastSobelAt: number;
  lastDocAlignerAt: number;
  lastIdentifyAt: number;
  lastBarcodeAt: number;
  inferInFlight: number;
};

export function createScanBudgetClock(): ScanBudgetClock {
  return {
    lastSobelAt: 0,
    lastDocAlignerAt: 0,
    lastIdentifyAt: 0,
    lastBarcodeAt: 0,
    inferInFlight: 0,
  };
}

export function minIntervalMs(
  kind: keyof typeof MIN_INTERVAL_MS,
): number {
  return MIN_INTERVAL_MS[kind];
}

/** True when enough time elapsed since the last tick of this kind. */
export function budgetAllows(
  clock: ScanBudgetClock,
  kind: keyof typeof MIN_INTERVAL_MS,
  now: number = Date.now(),
): boolean {
  const last =
    kind === "sobel"
      ? clock.lastSobelAt
      : kind === "docAligner"
        ? clock.lastDocAlignerAt
        : kind === "identify"
          ? clock.lastIdentifyAt
          : clock.lastBarcodeAt;
  return now - last >= MIN_INTERVAL_MS[kind];
}

export function markBudget(
  clock: ScanBudgetClock,
  kind: keyof typeof MIN_INTERVAL_MS,
  now: number = Date.now(),
): void {
  if (kind === "sobel") clock.lastSobelAt = now;
  else if (kind === "docAligner") clock.lastDocAlignerAt = now;
  else if (kind === "identify") clock.lastIdentifyAt = now;
  else clock.lastBarcodeAt = now;
}

/** Acquire a single infer slot (OCR / DocAligner / embed). */
export function tryAcquireInfer(clock: ScanBudgetClock): boolean {
  if (clock.inferInFlight >= SCAN_BUDGET.maxInferInFlight) return false;
  clock.inferInFlight += 1;
  return true;
}

export function releaseInfer(clock: ScanBudgetClock): void {
  clock.inferInFlight = Math.max(0, clock.inferInFlight - 1);
}
