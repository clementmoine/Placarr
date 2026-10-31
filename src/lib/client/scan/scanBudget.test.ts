import { describe, expect, it } from "vitest";

import {
  SCAN_BUDGET,
  budgetAllows,
  createScanBudgetClock,
  markBudget,
  minIntervalMs,
  releaseInfer,
  tryAcquireInfer,
} from "@/lib/client/scan/scanBudget";

describe("scanBudget", () => {
  it("encodes hard Hz ceilings from the 2026 plan", () => {
    expect(SCAN_BUDGET.sobelHz).toBe(5);
    expect(SCAN_BUDGET.docAlignerHz).toBe(2);
    expect(SCAN_BUDGET.identifyHz).toBe(1);
    expect(SCAN_BUDGET.maxInferInFlight).toBe(1);
    expect(minIntervalMs("sobel")).toBe(200);
    expect(minIntervalMs("docAligner")).toBe(500);
    expect(minIntervalMs("identify")).toBe(1000);
  });

  it("gates ticks by elapsed time", () => {
    const clock = createScanBudgetClock();
    expect(budgetAllows(clock, "sobel", 1000)).toBe(true);
    markBudget(clock, "sobel", 1000);
    expect(budgetAllows(clock, "sobel", 1100)).toBe(false);
    expect(budgetAllows(clock, "sobel", 1200)).toBe(true);
  });

  it("allows only one infer in-flight", () => {
    const clock = createScanBudgetClock();
    expect(tryAcquireInfer(clock)).toBe(true);
    expect(tryAcquireInfer(clock)).toBe(false);
    releaseInfer(clock);
    expect(tryAcquireInfer(clock)).toBe(true);
  });
});
