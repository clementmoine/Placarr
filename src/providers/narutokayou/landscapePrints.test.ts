import { describe, expect, it } from "vitest";

import {
  kayouCardNumberIsCcRotatedLandscapeWave,
  kayouCardNumberIsCcSeries,
  kayouCardNumberIsCompactPivotRarity,
  kayouEntryUsesRotatedLandscapeHeuristic,
  kayouCardNumberIsHrOrMr,
  kayouNameLooksLikeStoryPanel,
  kayouScanIsRotatedLandscape,
} from "./landscapePrints";

describe("kayouNameLooksLikeStoryPanel", () => {
  it.each([
    ["My Name Is Konohamaru! 1", true],
    ["A New Chapter Begins: The Chunin Exam! 5", true],
    ["R-111", true],
    ["SR-024", true],
    ["Naruto Uzumaki", false],
    ["PR-059", false],
  ])("%s → %s", (name, want) => {
    expect(kayouNameLooksLikeStoryPanel(name)).toBe(want);
  });
});

describe("kayouCardNumberIsCompactPivotRarity", () => {
  it.each([
    ["nrz08.hr.001", true],
    ["nrz08.mr.003", true],
    ["nrz07.pr.060", true],
    ["nrz08.r.001", false],
    ["nr.hr.121", true],
    ["nr.ss.hr.011", true],
    ["nr.ss.hr.020", true],
    ["nrss.hr.011", true],
  ])("%s → %s", (card, want) => {
    expect(kayouCardNumberIsCompactPivotRarity(card)).toBe(want);
  });
});

describe("kayouCardNumberIsHrOrMr", () => {
  it.each([
    ["nrz08.hr.001", true],
    ["nrz08.mr.003", true],
    ["nrz08.r.001", false],
    ["nr.hr.121", true],
  ])("%s → %s", (card, want) => {
    expect(kayouCardNumberIsHrOrMr(card)).toBe(want);
  });
});

describe("kayouCardNumberIsCcSeries", () => {
  it.each([
    ["cc.r.001", true],
    ["cc.mr.001", true],
    ["cc.ur.022", true],
    ["nr.cc.r.001", true],
    ["nr.cc.mr.001s", true],
    ["nr.hr.121", false],
    ["nrz08.hr.001", false],
  ])("%s → %s", (card, want) => {
    expect(kayouCardNumberIsCcSeries(card)).toBe(want);
  });
});

describe("kayouCardNumberIsCcRotatedLandscapeWave", () => {
  it.each([
    ["cc.r.001", true],
    ["cc.sr.024", true],
    ["cc.mr.001", false],
    ["cc.mr.005", false],
    ["nr.cc.r.001", true],
    ["nr.cc.sr.024", true],
    ["nr.cc.mr.001s", true],
    ["cc.mr.001s", true],
    ["cc.ptr.001", false],
    ["cc.qr.001", false],
    ["cc.sp.001", false],
    ["cc.ssr.001", false],
    ["cc.ur.001", false],
    ["nr.hr.121", false],
  ])("%s → %s", (card, want) => {
    expect(kayouCardNumberIsCcRotatedLandscapeWave(card)).toBe(want);
  });
});

describe("kayouScanIsRotatedLandscape", () => {
  it("flags NRZ08-style compact portrait HR scans", () => {
    expect(kayouScanIsRotatedLandscape(186, 264, "HR")).toBe(true);
    expect(kayouScanIsRotatedLandscape(188, 264, "HR")).toBe(true);
    expect(kayouScanIsRotatedLandscape(235, 320, "HR")).toBe(true);
  });

  it("keeps lenticular strips portrait", () => {
    expect(kayouScanIsRotatedLandscape(320, 450, "HR")).toBe(false);
    expect(kayouScanIsRotatedLandscape(768, 1076, "HR")).toBe(false);
  });

  it("flags New Year gift box nr.ss.hr compact landscape pivots", () => {
    expect(
      kayouScanIsRotatedLandscape(257, 361, "SS-HR", "nr.ss.hr.011"),
    ).toBe(true);
    expect(
      kayouScanIsRotatedLandscape(257, 361, "HR", "nr.ss.hr.020"),
    ).toBe(true);
  });

  it("keeps t4w6 MR portrait waves upright (not NRZ08-style pivot)", () => {
    expect(kayouScanIsRotatedLandscape(280, 396, "MR")).toBe(false);
    expect(kayouScanIsRotatedLandscape(281, 393, "MR")).toBe(false);
  });

  it("keeps t2w7 nrb07 character MRs portrait (~268×378 CapsuleCorp)", () => {
    expect(
      kayouScanIsRotatedLandscape(268, 378, "MR", "nrb07.mr.069", "Naruto Uzumaki"),
    ).toBe(false);
    expect(
      kayouScanIsRotatedLandscape(268, 377, "MR", "nrb07.mr.072", "Kakashi Hatake"),
    ).toBe(false);
  });

  it("still flags NRZ08 compact MR pivots as rotated landscape", () => {
    expect(kayouScanIsRotatedLandscape(186, 264, "MR", "nrz08.mr.003")).toBe(true);
  });

  it("flags Ninja Age cc.r / cc.sr / wedding mr.*s as rotated landscape", () => {
    expect(kayouScanIsRotatedLandscape(257, 357, "R", "cc.r.001")).toBe(true);
    expect(kayouScanIsRotatedLandscape(257, 362, "SR", "cc.sr.024")).toBe(true);
    expect(
      kayouScanIsRotatedLandscape(257, 357, "CC-R", "nr.cc.r.001"),
    ).toBe(true);
    expect(
      kayouScanIsRotatedLandscape(257, 366, "CC-SR", "nr.cc.sr.001"),
    ).toBe(true);
    expect(
      kayouScanIsRotatedLandscape(257, 361, "CC-MR", "nr.cc.mr.001s"),
    ).toBe(true);
  });

  it("keeps Ninja Age character cc.mr.001–005 portrait", () => {
    expect(kayouScanIsRotatedLandscape(257, 361, "MR", "cc.mr.001")).toBe(false);
    expect(kayouScanIsRotatedLandscape(257, 360, "MR", "cc.mr.002")).toBe(false);
    expect(kayouScanIsRotatedLandscape(257, 361, "MR", "cc.mr.005")).toBe(false);
  });

  it("keeps other Ninja Age cc tiers portrait despite shared scan size", () => {
    expect(kayouScanIsRotatedLandscape(257, 363, "PTR", "cc.ptr.001")).toBe(false);
    expect(kayouScanIsRotatedLandscape(257, 361, "QR", "cc.qr.001")).toBe(false);
    expect(kayouScanIsRotatedLandscape(257, 363, "SP", "cc.sp.001")).toBe(false);
    expect(kayouScanIsRotatedLandscape(257, 362, "SSR", "cc.ssr.001")).toBe(false);
    expect(kayouScanIsRotatedLandscape(257, 361, "UR", "cc.ur.001")).toBe(false);
  });

  it("auto-manages all cc.* index flags so stale cc.ptr/qr marks clear", () => {
    expect(
      kayouEntryUsesRotatedLandscapeHeuristic({ card: "cc.mr.001", rarity: "MR" }),
    ).toBe(true);
    expect(
      kayouEntryUsesRotatedLandscapeHeuristic({ card: "nr.cc.r.001", rarity: "CC-R" }),
    ).toBe(true);
    expect(
      kayouEntryUsesRotatedLandscapeHeuristic({ card: "cc.ptr.001", rarity: "PTR" }),
    ).toBe(true);
    expect(
      kayouEntryUsesRotatedLandscapeHeuristic({ card: "cc.r.001", rarity: "R" }),
    ).toBe(true);
  });

  it("flags t4w6 CapsuleCorp R-NNN stub story panels as rotated landscape", () => {
    expect(
      kayouScanIsRotatedLandscape(257, 363, "R", "nr.r.111", "R-111"),
    ).toBe(true);
    expect(
      kayouScanIsRotatedLandscape(257, 363, "R", "nr.r.160", "R-160"),
    ).toBe(true);
  });

  it("flags t2w7 story R panels (chapter titles) as rotated landscape", () => {
    expect(
      kayouScanIsRotatedLandscape(
        400,
        568,
        "R",
        "nr.r.161",
        "My Name Is Konohamaru! 1",
      ),
    ).toBe(true);
    expect(
      kayouScanIsRotatedLandscape(
        400,
        568,
        "R",
        "nr.r.210",
        "A New Chapter Begins: The Chunin Exam! 5",
      ),
    ).toBe(true);
  });

  it("keeps character R cards portrait despite CDN scan size", () => {
    expect(
      kayouScanIsRotatedLandscape(400, 564, "R", "nr.r.001", "Naruto Uzumaki"),
    ).toBe(false);
  });

  it("flags t4w7 PR-060 compact pivot scan as rotated landscape", () => {
    expect(kayouScanIsRotatedLandscape(216, 304, "PR", "nrz07.pr.060")).toBe(true);
  });

  it("flags attested CDN catalogue promo pivots as rotated landscape", () => {
    expect(kayouScanIsRotatedLandscape(400, 562, "PR", "nr.pr.058")).toBe(true);
    expect(kayouScanIsRotatedLandscape(400, 568, "PR", "nr.pr.060")).toBe(true);
    expect(kayouScanIsRotatedLandscape(400, 562, "PR", "nr.pr.070")).toBe(true);
  });

  it("keeps other catalogue nr.pr.* promos portrait (compact + CDN)", () => {
    expect(kayouScanIsRotatedLandscape(257, 361, "PR", "nr.pr.001")).toBe(false);
    expect(kayouScanIsRotatedLandscape(257, 361, "PR", "nr.pr.046")).toBe(false);
    expect(kayouScanIsRotatedLandscape(400, 564, "PR", "nr.pr.055")).toBe(false);
    expect(kayouScanIsRotatedLandscape(400, 564, "PR", "nr.pr.059")).toBe(false);
    expect(kayouScanIsRotatedLandscape(400, 561, "PR", "nr.pr.071")).toBe(false);
  });

  it("auto-clears stale nr.pr.* landscape flags", () => {
    expect(
      kayouEntryUsesRotatedLandscapeHeuristic({ card: "nr.pr.001", rarity: "PR" }),
    ).toBe(true);
  });

  it("ignores non HR/MR/PR and already-landscape scans", () => {
    expect(kayouScanIsRotatedLandscape(186, 264, "R")).toBe(false);
    expect(kayouScanIsRotatedLandscape(450, 320, "HR")).toBe(false);
  });
});
