import { describe, expect, it } from "vitest";

import { maskNeedsMirroring } from "./useMirroredCropMask";

const MASK = "https://api.lorcana.ravensburger.com/images/fr/set1/17_abc.jpg";

describe("maskNeedsMirroring", () => {
  it("re-cuts the mask once the artwork has been cropped", () => {
    expect(maskNeedsMirroring("/uploads/abc_edited.jpg", MASK)).toBe(true);
    expect(maskNeedsMirroring("/uploads/abc_edited-background.jpg", MASK)).toBe(
      true,
    );
  });

  it("leaves an uncropped artwork alone — the mask already matches it", () => {
    expect(maskNeedsMirroring("/uploads/abc.jpg", MASK)).toBe(false);
  });

  it("skips a remote artwork, which this app never cropped", () => {
    expect(maskNeedsMirroring("https://example.com/abc_edited.jpg", MASK)).toBe(
      false,
    );
  });

  it("has nothing to do without both pieces", () => {
    expect(maskNeedsMirroring("/uploads/abc_edited.jpg", null)).toBe(false);
    expect(maskNeedsMirroring(null, MASK)).toBe(false);
  });
});
