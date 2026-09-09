import { describe, expect, it } from "vitest";

import {
  kayouOfficialIdSlug,
  kayouOfficialIdSuffixKeys,
  kayouOfficialIdToCcNumber,
  kayouOfficialIdToPrint,
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

describe("kayouOfficialIdToPrint", () => {
  it("maps Smriti product codes onto set + number", () => {
    expect(kayouOfficialIdToPrint("NREA01-SR-018L2")).toEqual({
      setCode: "nrea01",
      number: "nrea01.sr.018l2",
    });
    expect(kayouOfficialIdToPrint("NREA02-CR-001L5")).toEqual({
      setCode: "nrea02",
      number: "nrea02.cr.001l5",
    });
    expect(kayouOfficialIdToPrint("NRI01-SP-001L5")).toEqual({
      setCode: "nri01",
      number: "nri01.sp.001l5",
    });
    expect(kayouOfficialIdToPrint("NRSA02-◇ASP-001L5")).toEqual({
      setCode: "nrsa02",
      number: "nrsa02.asp.001l5s",
    });
    expect(kayouOfficialIdToPrint("NRCCNA-MR-001")).toEqual({
      setCode: "ninjaagebox",
      number: "cc.mr.001",
    });
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
