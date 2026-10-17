import { describe, expect, it } from "vitest";

import {
  KAYOU_LENTICULAR_TYPES,
  kayouLenticularTypeForFinish,
} from "@/effects/narutokayou/lenticularTypes";

describe("kayouLenticularTypes", () => {
  it("lists one playroom material per lenticular family", () => {
    expect(KAYOU_LENTICULAR_TYPES.map((row) => row.finish)).toEqual([
      "hr-2x2",
      "hr-3x2",
      "hr-3x1",
      "hr-2x1",
      "bp",
      "mr",
      "holo",
    ]);
  });

  it("curates Heaven Scroll HR grid exemplars", () => {
    const hr = KAYOU_LENTICULAR_TYPES.filter((row) => row.finish.startsWith("hr-"));
    expect(hr).toEqual([
      expect.objectContaining({
        finish: "hr-2x2",
        panelCols: 2,
        panelRows: 2,
        landscapeFace: true,
        exemplarPrintKey: "kayou:smritiheavenscrolls1-nrss.hr.002",
      }),
      expect.objectContaining({
        finish: "hr-3x2",
        panelCols: 2,
        panelRows: 3,
        landscapeFace: true,
        exemplarPrintKey: "kayou:smritiheavenscrolls1-nrss.hr.005",
      }),
      expect.objectContaining({
        finish: "hr-3x1",
        panelCols: 1,
        panelRows: 3,
        exemplarPrintKey: "kayou:smritiheavenscrolls1-nrss.hr.003",
      }),
      expect.objectContaining({
        finish: "hr-2x1",
        panelCols: 1,
        panelRows: 2,
        exemplarPrintKey: "kayou:smritiheavenscrolls1-nrss.hr.008",
      }),
    ]);
  });

  it("curates distinct exemplar prints", () => {
    const keys = KAYOU_LENTICULAR_TYPES.map((row) => row.exemplarPrintKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("resolves finishes case-insensitively", () => {
    expect(kayouLenticularTypeForFinish("HR-3X1")?.id).toBe("hr-3x1");
    expect(kayouLenticularTypeForFinish("hr-2×2")?.id).toBe("hr-2x2");
  });
});
