import { describe, expect, it } from "vitest";

import {
  emptyScanObservations,
  patchScanObservations,
} from "@/core/identify/scanObservations";
import { parseCollectorNumberHint } from "@/core/identify/collectorNumberHint";

describe("scanObservations", () => {
  it("starts as an honest empty miss", () => {
    const obs = emptyScanObservations(1);
    expect(obs.subject.usable).toBe(false);
    expect(obs.identify.confidence).toBe("miss");
    expect(obs.ocr.engine).toBe("none");
  });

  it("patches OCR + identify without dropping sibling fields", () => {
    const base = emptyScanObservations(1);
    const next = patchScanObservations(
      base,
      {
        ocr: {
          text: "107/204 • FR • 2",
          engine: "ppocr-client",
          status: "ok",
        },
        identify: {
          confidence: "doubt",
          path: "client",
          matches: [
            { printKey: "lorcana:2-107", distance: 210, method: "embed" },
          ],
        },
      },
      2,
    );
    expect(next.updatedAt).toBe(2);
    expect(next.ocr.text).toContain("107");
    expect(next.identify.matches).toHaveLength(1);
    expect(next.subject.source).toBe("none");
    const hint = parseCollectorNumberHint(next.ocr.text);
    expect(hint?.needle).toBe("107");
    expect(hint?.set).toBe("2");
  });
});
