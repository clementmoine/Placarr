import { describe, expect, it } from "vitest";

import {
  SCAN_BUDGET,
  budgetAllowsBarcode,
  budgetAllowsIdentify,
  createScanBudgetClock,
  markBarcode,
  markIdentifyComplete,
  minIntervalMs,
  releaseInfer,
  tryAcquireInfer,
} from "@/lib/client/scan/scanBudget";

describe("scanBudget", () => {
  it("keeps barcode Hz + single infer slot; no vision metronomes", () => {
    expect(SCAN_BUDGET.barcodeHz).toBe(8);
    expect(SCAN_BUDGET.maxInferInFlight).toBe(1);
    expect(minIntervalMs("barcode")).toBe(125);
    expect(SCAN_BUDGET).not.toHaveProperty("sobelHz");
    expect(SCAN_BUDGET).not.toHaveProperty("docAlignerHz");
    expect(SCAN_BUDGET).not.toHaveProperty("identifyHz");
  });

  it("gates barcode by elapsed time", () => {
    const clock = createScanBudgetClock();
    expect(budgetAllowsBarcode(clock, 1000)).toBe(true);
    markBarcode(clock, 1000);
    expect(budgetAllowsBarcode(clock, 1100)).toBe(false);
    expect(budgetAllowsBarcode(clock, 1125)).toBe(true);
  });

  it("allows only one infer in-flight", () => {
    const clock = createScanBudgetClock();
    expect(tryAcquireInfer(clock)).toBe(true);
    expect(tryAcquireInfer(clock)).toBe(false);
    releaseInfer(clock);
    expect(tryAcquireInfer(clock)).toBe(true);
  });

  it("paces identify from measured duration", () => {
    const clock = createScanBudgetClock();
    expect(budgetAllowsIdentify(clock, 1000)).toBe(true);
    expect(tryAcquireInfer(clock)).toBe(true);
    expect(budgetAllowsIdentify(clock, 1000)).toBe(false);
    releaseInfer(clock);
    markIdentifyComplete(clock, 400, 1000);
    expect(clock.identifyPaceMs).toBe(400);
    expect(budgetAllowsIdentify(clock, 1200)).toBe(false);
    expect(budgetAllowsIdentify(clock, 1400)).toBe(true);
  });

  it("refuses a second identify while the prior sample is in flight", () => {
    const clock = createScanBudgetClock();
    expect(tryAcquireInfer(clock)).toBe(true);
    expect(budgetAllowsIdentify(clock, Date.now())).toBe(false);
  });
});
