import { describe, expect, it } from "vitest";

import { catalogueCollectorKey } from "@/lib/admin/catalogueCards";

import tcdbEnCcg from "./curated/sources/tcdb-en-ccg.json";
import {
  parseTcdbNarutoRef,
  parseTcdbSidFromUrl,
  tcdbAcronymToSeries,
  tcdbNarutoSidIngestPolicy,
  tcdbNarutoSidKind,
} from "./parseTcdbNaruto";

describe("parseTcdbNarutoRef", () => {
  it.each([
    ["PTHJ-001", "PTH", "j", "j001"],
    ["pthn-015", "PTH", "n", "n015"],
    ["PTHM-001", "PTH", "m", "m001"],
    ["COSJ-043", "COS", "j", "j043"],
    ["COSN-074", "COS", "n", "n074"],
    ["COSC-001", "COS", "c", "c001"],
    ["CUSC-008", "CUS", "c", "c008"],
    ["CUSJ-085", "CUS", "j", "j085"],
    ["CUSN-124", "CUS", "n", "n124"],
    ["DLN-187", "DL", "n", "n187"],
    ["BODN-264", "BOD", "n", "n264"],
  ])("%s → %s %s %s", (raw, acronym, cardType, number) => {
    expect(parseTcdbNarutoRef(raw)).toMatchObject({
      acronym,
      cardType,
      number,
      variant: null,
    });
  });

  it("does not invent a Bandai id for TCDB US-variant codes", () => {
    expect(parseTcdbNarutoRef("BODN-us059")).toMatchObject({
      acronym: "BOD",
      cardType: "n",
      number: null,
      variant: "us",
    });
  });

  it("never stores the invented TCDB prefix as a collector id", () => {
    const parsed = parseTcdbNarutoRef("PTHJ-001")!;
    expect(parsed.number).toBe("j001");
    expect(parsed.number).not.toMatch(/pth/i);
    expect(catalogueCollectorKey(parsed.number!)).toBe("j:0001");
  });

  it("rejects Carddass, Coleka EU, and real Bandai promo prefixes", () => {
    expect(parseTcdbNarutoRef("NI-1650")).toBeNull();
    expect(parseTcdbNarutoRef("TE-109")).toBeNull();
    expect(parseTcdbNarutoRef("TA-190")).toBeNull();
    expect(parseTcdbNarutoRef("CL-032")).toBeNull();
    expect(parseTcdbNarutoRef("PR-096")).toBeNull();
    expect(parseTcdbNarutoRef("j001")).toBeNull();
  });
});

describe("tcdb acronyms and sids", () => {
  it("maps observed acronyms onto EN CCG series, not Carddass labels", () => {
    expect(tcdbAcronymToSeries("PTH")).toBe(1);
    expect(tcdbAcronymToSeries("COS")).toBe(2);
    expect(tcdbAcronymToSeries("CUS")).toBe(3);
    expect(tcdbAcronymToSeries("DL")).toBe(5);
    expect(tcdbAcronymToSeries("BOD")).toBe(8);
    expect(tcdbAcronymToSeries("NI")).toBeNull();
  });

  it("treats the three 2006 main sets as staging-only, never cards/s1/en", () => {
    for (const row of tcdbEnCcg.mainSets) {
      expect(tcdbNarutoSidIngestPolicy(row.sid)).toBe("staging-only");
      expect(tcdbNarutoSidKind(row.sid)).toMatchObject({
        kind: "en-ccg-set",
        series: row.series,
        title: row.title,
      });
    }
  });

  it("rejects the promo grab-bag and the misdated 2002 listing", () => {
    expect(tcdbNarutoSidKind(118974)).toEqual({
      kind: "grab-bag",
      sid: 118974,
    });
    expect(tcdbNarutoSidIngestPolicy(118974)).toBe("reject");
    expect(tcdbNarutoSidKind(256824)).toEqual({
      kind: "do-not-merge",
      sid: 256824,
    });
    expect(tcdbNarutoSidIngestPolicy(256824)).toBe("reject");
  });

  it("reads sids from the ViewSet URLs the user sent", () => {
    expect(
      parseTcdbSidFromUrl(
        "https://www.tcdb.com/ViewSet.cfm/sid/116757/2006-Naruto-Series-1:-The-Path-to-Hokage",
      ),
    ).toBe(116757);
    expect(
      parseTcdbSidFromUrl(
        "https://www.tcdb.com/ViewCard.cfm/sid/116757/cid/7993800",
      ),
    ).toBe(116757);
    expect(parseTcdbSidFromUrl("/ViewAll.cfm/sp/Gaming?Let=N")).toBeNull();
  });

  it("records that the N-index does not list Storm 3", () => {
    expect(tcdbEnCcg.nIndex.missingOnIndex).toContain(28);
    expect(tcdbEnCcg.nIndex.listedSeriesTitles).not.toHaveProperty("13");
    expect(tcdbEnCcg.nIndex.listedSeriesTitles["1"]).toBe("The Path to Hokage");
    expect(
      parseTcdbSidFromUrl(
        "https://www.tcdb.com/ViewSet.cfm/sid/256824/2002-Bandai-Naruto-The-Path-to-Hokage",
      ),
    ).toBe(256824);
    const misdated = tcdbEnCcg.doNotIngest.find((row) => row.sid === 256824);
    expect(misdated?.url).toContain("sid/256824");
  });
});
