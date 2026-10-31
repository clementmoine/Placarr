import { describe, expect, it } from "vitest";

import {
  USABLE_SUBJECT,
  isUsableSubject,
} from "@/lib/client/scan/isUsableSubject";

describe("isUsableSubject", () => {
  it("accepts a portrait card window in the live coverage band", () => {
    expect(
      isUsableSubject({
        coverage: 0.4,
        aabb: { width: 200, height: 280 },
      }),
    ).toBe(true);
  });

  it.each([
    {
      name: "too small coverage",
      m: { coverage: 0.05, aabb: { width: 200, height: 280 } },
    },
    {
      name: "desk-swallowing coverage",
      m: { coverage: 0.9, aabb: { width: 200, height: 280 } },
    },
    {
      name: "landscape aabb",
      m: { coverage: 0.4, aabb: { width: 280, height: 200 } },
    },
    {
      name: "tiny aabb",
      m: { coverage: 0.4, aabb: { width: 20, height: 40 } },
    },
  ])("rejects $name", ({ m }) => {
    expect(isUsableSubject(m)).toBe(false);
  });

  it("exposes shared thresholds for overlay + crop", () => {
    expect(USABLE_SUBJECT.minCoverage).toBe(0.08);
    expect(USABLE_SUBJECT.maxCoverage).toBe(0.78);
  });
});
