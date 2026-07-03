import { describe, expect, it } from "vitest";

import { isBenignScannerMediaError } from "./BarcodeScannerView";

describe("isBenignScannerMediaError", () => {
  it("ignores play() interruptions when the scanner unmounts", () => {
    expect(
      isBenignScannerMediaError(
        new Error(
          "The play() request was interrupted because the media was removed from the document.",
        ),
      ),
    ).toBe(true);
  });

  it("keeps real camera failures visible", () => {
    expect(isBenignScannerMediaError(new Error("Permission denied"))).toBe(
      false,
    );
  });
});
