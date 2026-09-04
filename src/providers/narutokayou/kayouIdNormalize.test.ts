import { describe, expect, it } from "vitest";

import {
  kayouBoxToSetCode,
  kayouCleanPrintedId,
  canonicalizeKayouNumber,
  canonicalizeKayouNumberForSet,
  kayouHitmarketFileToNumber,
  kayouHitmarketRelativePath,
  kayouPrintedToNumber,
} from "./kayouIdNormalize";

describe("kayouIdNormalize", () => {
  it("maps CCG box labels to set codes", () => {
    expect(kayouBoxToSetCode("T4W8")).toBe("t4w8");
    expect(kayouBoxToSetCode("NinjaAge")).toBe("ninjaagebox");
    expect(kayouBoxToSetCode("Heaven&Earth")).toBe("smritiheavenscrolls1");
  });

  it("normalizes full Kayou printed ids", () => {
    expect(kayouPrintedToNumber("NRZ08-ASP-001")).toBe("nrz08.asp.001");
    expect(kayouPrintedToNumber("NR-R-001")).toBe("nr.r.001");
  });

  it("adds nr. prefix to box-scoped CCG ids", () => {
    expect(kayouPrintedToNumber("SP-002")).toBe("nr.sp.002");
    expect(kayouPrintedToNumber("UR-014")).toBe("nr.ur.014");
  });

  it("strips lenticular diamond entities", () => {
    expect(kayouCleanPrintedId("NRZ08-&#x25C7;ASP-001")).toBe("NRZ08-ASP-001");
  });

  it("reads hitmarket filenames with full prefixes", () => {
    expect(kayouHitmarketFileToNumber("NRSS-UR-001.webp")).toBe("nrss.ur.001");
    expect(kayouHitmarketFileToNumber("HR-1.webp")).toBeNull();
  });

  it("collapses CCG nr.ss / nr.cc onto narutocards forms", () => {
    expect(kayouPrintedToNumber("NR-SS-HR-011")).toBe("nrss.hr.011");
    expect(kayouPrintedToNumber("NR-CC-R-001")).toBe("cc.r.001");
    expect(canonicalizeKayouNumber("nr.ss.hr.002")).toBe("nrss.hr.002");
    expect(canonicalizeKayouNumber("nr.cc.mr.001s")).toBe("cc.mr.001s");
  });

  it("admits SLR+ as slrplus for printKey segments", () => {
    expect(canonicalizeKayouNumber("nr.slr+.001")).toBe("nr.slrplus.001");
  });

  it("maps short nr.* onto wave prefixes for twin sets", () => {
    expect(canonicalizeKayouNumberForSet("t2w7", "nr.cr.023")).toBe(
      "nrb07.cr.023",
    );
    expect(canonicalizeKayouNumberForSet("t4w6", "nr.bp.028")).toBe(
      "nrz06.bp.028",
    );
    expect(canonicalizeKayouNumberForSet("t1w1", "nr.r.001")).toBe("nr.r.001");
  });
});
