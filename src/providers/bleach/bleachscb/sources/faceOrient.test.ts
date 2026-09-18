import { describe, expect, it } from "vitest";

import { bleachScbJaFaceRotateDeg } from "./faceOrient";

describe("bleachScbJaFaceRotateDeg", () => {
  it("rotates attested early Blast Soul + Ability scans CCW 90°", () => {
    expect(
      bleachScbJaFaceRotateDeg({ type: "ブラストソウル", number: "026" }),
    ).toBe(270);
    expect(
      bleachScbJaFaceRotateDeg({ type: "ブラストソウル", number: "099" }),
    ).toBe(270);
    expect(bleachScbJaFaceRotateDeg({ type: "アビリティ", number: "029" })).toBe(
      270,
    );
    expect(bleachScbJaFaceRotateDeg({ set: "ability", number: "022" })).toBe(
      270,
    );
  });

  it("leaves later Blast Souls and Main Soul upright", () => {
    expect(
      bleachScbJaFaceRotateDeg({ type: "ブラストソウル", number: "500" }),
    ).toBe(0);
    expect(
      bleachScbJaFaceRotateDeg({ type: "ブラストソウル", number: "687" }),
    ).toBe(0);
    expect(bleachScbJaFaceRotateDeg({ type: "メインソウル", number: "002" })).toBe(
      0,
    );
    expect(bleachScbJaFaceRotateDeg({ type: "バトル" })).toBe(0);
  });
});
