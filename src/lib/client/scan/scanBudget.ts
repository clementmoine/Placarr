/**
 * Runtime energy constraints for the live scan stack (phone-first).
 *
 * Vision and DocAligner are frame-/event-driven (no Hz metronomes). Identify
 * pacing is the measured round-trip. Only barcode keeps a native poll ceiling,
 * and ORT is hard-capped at one infer in flight.
 */

export const SCAN_BUDGET = {
  /** Native / ZXing barcode loop — sensor poll, not vision. */
  barcodeHz: 8,
  /** At most one ONNX/transformers infer in flight across the scan stack. */
  maxInferInFlight: 1,
} as const;

const BARCODE_INTERVAL_MS = 1000 / SCAN_BUDGET.barcodeHz;

export type ScanBudgetClock = {
  lastBarcodeAt: number;
  /** Wall time when the last identify sample finished. */
  lastIdentifyAt: number;
  /** Rolling pacing target (ms) from measured identify cost; 0 = back-to-back. */
  identifyPaceMs: number;
  inferInFlight: number;
};

export function createScanBudgetClock(): ScanBudgetClock {
  return {
    lastBarcodeAt: 0,
    lastIdentifyAt: 0,
    identifyPaceMs: 0,
    inferInFlight: 0,
  };
}

export function minIntervalMs(kind: "barcode"): number {
  return BARCODE_INTERVAL_MS;
}

/** True when enough time elapsed since the last barcode tick. */
export function budgetAllowsBarcode(
  clock: ScanBudgetClock,
  now: number = Date.now(),
): boolean {
  return now - clock.lastBarcodeAt >= BARCODE_INTERVAL_MS;
}

export function markBarcode(
  clock: ScanBudgetClock,
  now: number = Date.now(),
): void {
  clock.lastBarcodeAt = now;
}

/**
 * Identify may start when no sample is in flight and the measured pace since
 * the last finish has elapsed (0 → immediate retry).
 */
export function budgetAllowsIdentify(
  clock: ScanBudgetClock,
  now: number = Date.now(),
): boolean {
  if (clock.inferInFlight >= SCAN_BUDGET.maxInferInFlight) return false;
  return now - clock.lastIdentifyAt >= clock.identifyPaceMs;
}

/** Record a finished identify sample and update the measured pace. */
export function markIdentifyComplete(
  clock: ScanBudgetClock,
  durationMs: number,
  now: number = Date.now(),
): void {
  clock.lastIdentifyAt = now;
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  // EMA toward the last cost so a slow phone paces itself without a Hz knob.
  const prev = clock.identifyPaceMs;
  clock.identifyPaceMs = prev <= 0 ? durationMs : prev * 0.6 + durationMs * 0.4;
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

/** True when DocAligner / OCR may take the ORT slot. */
export function inferSlotFree(clock: ScanBudgetClock): boolean {
  return clock.inferInFlight < SCAN_BUDGET.maxInferInFlight;
}
