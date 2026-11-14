import { describe, expect, it } from "vitest";

import {
  orderSubjectsByFocus,
  pickSubjectAtNorm,
  subjectKeyFromAabb,
  type FocusableSubject,
} from "@/lib/client/scan/subjectFocus";

function subject(
  partial: Partial<FocusableSubject> & {
    key: string;
    score: number;
  },
): FocusableSubject {
  return {
    coverage: 0.3,
    aabb: { left: 0, top: 0, width: 100, height: 140 },
    cornersNorm: [
      { x: 0.1, y: 0.1 },
      { x: 0.3, y: 0.1 },
      { x: 0.3, y: 0.4 },
      { x: 0.1, y: 0.4 },
    ],
    ...partial,
  };
}

describe("subjectFocus", () => {
  it("ranks primary as the higher-score (more centred) subject", () => {
    const edge = subject({
      key: "edge",
      score: 10,
      cornersNorm: [
        { x: 0.7, y: 0.1 },
        { x: 0.9, y: 0.1 },
        { x: 0.9, y: 0.4 },
        { x: 0.7, y: 0.4 },
      ],
    });
    const centre = subject({
      key: "centre",
      score: 50,
      cornersNorm: [
        { x: 0.35, y: 0.25 },
        { x: 0.65, y: 0.25 },
        { x: 0.65, y: 0.7 },
        { x: 0.35, y: 0.7 },
      ],
    });
    const ordered = orderSubjectsByFocus([edge, centre], null);
    expect(ordered[0]?.key).toBe("centre");
    expect(ordered[1]?.key).toBe("edge");
  });

  it("promotes a tap focus ahead of score ranking", () => {
    const a = subject({ key: "a", score: 50 });
    const b = subject({
      key: "b",
      score: 10,
      cornersNorm: [
        { x: 0.7, y: 0.1 },
        { x: 0.9, y: 0.1 },
        { x: 0.9, y: 0.4 },
        { x: 0.7, y: 0.4 },
      ],
    });
    const ordered = orderSubjectsByFocus([a, b], "b");
    expect(ordered.map((s) => s.key)).toEqual(["b", "a"]);
  });

  it("pickSubjectAtNorm hits a secondary quad", () => {
    const primary = subject({
      key: "primary",
      score: 50,
      cornersNorm: [
        { x: 0.2, y: 0.2 },
        { x: 0.4, y: 0.2 },
        { x: 0.4, y: 0.5 },
        { x: 0.2, y: 0.5 },
      ],
    });
    const secondary = subject({
      key: "secondary",
      score: 10,
      cornersNorm: [
        { x: 0.6, y: 0.2 },
        { x: 0.8, y: 0.2 },
        { x: 0.8, y: 0.5 },
        { x: 0.6, y: 0.5 },
      ],
    });
    expect(pickSubjectAtNorm([primary, secondary], 0.7, 0.35)?.key).toBe(
      "secondary",
    );
    expect(pickSubjectAtNorm([primary, secondary], 0.3, 0.35)?.key).toBe(
      "primary",
    );
    expect(pickSubjectAtNorm([primary, secondary], 0.5, 0.9)).toBeNull();
  });

  it("subjectKeyFromAabb is stable under small jitter", () => {
    const a = subjectKeyFromAabb({ left: 100, top: 200, width: 120, height: 160 });
    const b = subjectKeyFromAabb({ left: 105, top: 204, width: 120, height: 160 });
    expect(a).toBe(b);
  });
});
