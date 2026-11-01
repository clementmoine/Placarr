import { describe, expect, it } from "vitest";

import { scanOverlayHint } from "./scanHints";

const t = (key: string) => key;

describe("scanOverlayHint", () => {
  it("shows card-miss advice in Auto after an identify miss", () => {
    expect(scanOverlayHint(t, "ok", "looking", "auto", true, false)).toBe(
      "scanner.hintNoMatch",
    );
  });

  it("shows card-miss advice in card mode", () => {
    expect(scanOverlayHint(t, "ok", "looking", "card", true, false)).toBe(
      "scanner.hintNoMatch",
    );
  });

  it("says turn the card over only while still looking at a back — a unique-back hit delivers", () => {
    expect(
      scanOverlayHint(t, "card_back", "looking", "auto", true, false),
    ).toBe("scanner.hintCardBack");
    expect(
      scanOverlayHint(t, "card_back", "delivering", "auto", false, true),
    ).toBe("scanner.phaseDelivering");
  });

  it("keeps Auto aim copy when identify has not missed", () => {
    expect(scanOverlayHint(t, "ok", "looking", "auto", false, false)).toBe(
      "scanner.autoHint",
    );
  });

  it("keeps Analyse… off when a shortlist is already visible", () => {
    expect(scanOverlayHint(t, "ok", "understanding", "auto", false, true)).toBe(
      "",
    );
  });
});
