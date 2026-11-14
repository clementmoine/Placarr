import { describe, expect, it } from "vitest";

import {
  formatGradeBadge,
  isGradeStatus,
  isGradeWip,
  isGradedSlab,
  mergeItemGrade,
  normalizeGradeHouse,
  rawGradeState,
  readItemGrade,
} from "./itemGrade";

describe("itemGrade", () => {
  it("normalizes known houses", () => {
    expect(normalizeGradeHouse("psa")).toBe("PSA");
    expect(normalizeGradeHouse("  cgc ")).toBe("CGC");
    expect(normalizeGradeHouse("CustomLab")).toBe("CustomLab");
    expect(isGradeStatus("submitted")).toBe(true);
    expect(isGradeStatus("mint")).toBe(false);
  });

  it("merges submitted WIP and graded slabs", () => {
    const submitted = mergeItemGrade(rawGradeState(), {
      gradeStatus: "submitted",
      gradeHouse: "psa",
    });
    expect(submitted).toMatchObject({
      gradeStatus: "submitted",
      gradeHouse: "PSA",
      gradedAt: null,
    });
    expect(isGradeWip(submitted)).toBe(true);

    const graded = mergeItemGrade(submitted, {
      gradeStatus: "graded",
      gradeLabel: "10",
      gradeCertNo: "123",
    });
    expect(graded?.gradeStatus).toBe("graded");
    expect(graded?.gradeLabel).toBe("10");
    expect(graded?.gradeCertNo).toBe("123");
    expect(graded?.gradedAt).toBeInstanceOf(Date);
    expect(isGradedSlab(graded)).toBe(true);
  });

  it("clears on raw and formats badges", () => {
    const cleared = mergeItemGrade(
      { gradeStatus: "graded", gradeHouse: "PSA", gradeLabel: "10" },
      { gradeStatus: "raw" },
    );
    expect(cleared).toEqual(rawGradeState());
    expect(formatGradeBadge(readItemGrade({ gradeStatus: "raw" }))).toBeNull();
    expect(
      formatGradeBadge({
        gradeStatus: "submitted",
        gradeHouse: "CGC",
        gradeLabel: null,
      }),
    ).toBe("CGC · WIP");
    expect(
      formatGradeBadge({
        gradeStatus: "graded",
        gradeHouse: "PSA",
        gradeLabel: "10",
      }),
    ).toBe("PSA 10");
  });

  it("infers graded when only a label is written onto raw", () => {
    const graded = mergeItemGrade(rawGradeState(), {
      gradeHouse: "BGS",
      gradeLabel: "9.5",
    });
    expect(graded?.gradeStatus).toBe("graded");
    expect(graded?.gradeHouse).toBe("BGS");
  });
});
