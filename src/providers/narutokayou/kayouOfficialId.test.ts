import { describe, expect, it } from "vitest";

import {
  kayouOfficialIdSlug,
  kayouOfficialIdSuffixKeys,
  kayouOfficialIdToCcNumber,
  kayouOfficialLookupKeys,
} from "./kayouOfficialId";

describe("kayouOfficialIdSlug", () => {
  it("normalizes official id codes", () => {
    expect(kayouOfficialIdSlug("NREA02-UR-015L3")).toBe("nrea02-ur-015l3");
    expect(kayouOfficialIdSlug("NRI01-AR-006L4")).toBe("nri01-ar-006l4");
    expect(kayouOfficialIdSlug("NREA02-◇UR-001L3")).toBe("nrea02-shin-ur-001l3");
  });
});

describe("kayouOfficialIdToCcNumber", () => {
  it.each([
    ["NRCCNA-◇MR-001", "cc.mr.001s"],
    ["NRCCNA-◇MR-002", "cc.mr.002s"],
    ["NRCCNA-MR-001", "cc.mr.001"],
    ["NRCCNA-XR-001L5", "cc.xr.001l5"],
    ["NRCCNA-R-024", "cc.r.024"],
    ["NREA02-UR-015L3", null],
  ])("%s → %s", (id, want) => {
    expect(kayouOfficialIdToCcNumber(id)).toBe(want);
  });
});

describe("kayouOfficialLookupKeys", () => {
  it("builds suffix keys from catalogue references", () => {
    expect(kayouOfficialLookupKeys("NREA02-UR-015L3", "UR")).toContain(
      "nrea02-ur-015l3",
    );
    expect(kayouOfficialLookupKeys("NR-UR-015", "UR")).toContain("ur-015");
  });
});

describe("kayouOfficialIdSuffixKeys", () => {
  it("extracts rarity-number suffix", () => {
    expect(kayouOfficialIdSuffixKeys("NREA02-UR-015L3")).toEqual([
      "ur-015l3",
      "nrea02-ur-015l3",
    ]);
  });
});
