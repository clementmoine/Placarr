/**
 * carddass.fr face parse / match / install-row selection.
 */
import { describe, expect, it } from "vitest";

import {
  carddassFrSeriesToSetHint,
  matchCarddassFrToDbsjccPrint,
  parseCarddassFrCardImagePath,
  parseCarddassFrFaceFile,
  selectCarddassFrInstallRows,
} from "../harvest/carddassFr";
import type { DbsjccPrintCandidate } from "../harvest/chitoroshop";

describe("parseCarddassFrCardImagePath", () => {
  it("accepts Part 3 category folders that the flat JPEG regex missed", () => {
    expect(
      parseCarddassFrCardImagePath(
        "/dbz/images/cartes/3/CHARACTER/D-215.jpg",
      ),
    ).toEqual({
      series: "3",
      category: "CHARACTER",
      file: "D-215.jpg",
    });
    expect(
      parseCarddassFrCardImagePath("/dbz/images/cartes/3/ACTION/D-268.jpg"),
    ).toMatchObject({ series: "3", category: "ACTION", file: "D-268.jpg" });
    expect(
      parseCarddassFrCardImagePath("/dbz/images/cartes/4/JPEG/D-021 PA copie.jpg"),
    ).toMatchObject({ series: "4", category: "JPEG", file: "D-021 PA copie.jpg" });
    expect(
      parseCarddassFrCardImagePath("/dbz/images/cartes/1/D-001.jpg"),
    ).toMatchObject({ series: "1", category: null, file: "D-001.jpg" });
  });

  it("accepts Hors-série SP dumps under Promos/ and cartes_med/", () => {
    expect(
      parseCarddassFrCardImagePath("/dbz/images/cartes/Promos/SP-4.jpg"),
    ).toEqual({ series: "sp", category: null, file: "SP-4.jpg" });
    expect(
      parseCarddassFrCardImagePath(
        "/dbz/images/cartes/cartes_med/DB Carte promo SP-22.jpg",
      ),
    ).toEqual({
      series: "sp",
      category: null,
      file: "DB Carte promo SP-22.jpg",
    });
    expect(
      parseCarddassFrCardImagePath(
        "/dbz/images/cartes/cartes_med/wallpaper.jpg",
      ),
    ).toBeNull();
  });
});

describe("carddassFrSeriesToSetHint", () => {
  it("maps series 1–10 to partN and Hors-série to sp", () => {
    expect(carddassFrSeriesToSetHint("1")).toBe("part1");
    expect(carddassFrSeriesToSetHint("10")).toBe("part10");
    expect(carddassFrSeriesToSetHint("11")).toBeNull();
    expect(carddassFrSeriesToSetHint("sp")).toBe("sp");
    expect(carddassFrSeriesToSetHint("promo")).toBe("sp");
  });
});

describe("parseCarddassFrFaceFile", () => {
  it("parses plain D-### and D### filenames", () => {
    expect(parseCarddassFrFaceFile("D-001.jpg")).toEqual({
      printed: "D-1",
      number: "d0001",
      kind: "plain",
      marker: null,
    });
    expect(parseCarddassFrFaceFile("D728.jpg")).toEqual({
      printed: "D-728",
      number: "d0728",
      kind: "plain",
      marker: null,
    });
  });

  it("treats bare copie as plain re-upload", () => {
    expect(parseCarddassFrFaceFile("D-099 copie.jpg")).toEqual({
      printed: "D-99",
      number: "d0099",
      kind: "plain",
      marker: null,
    });
  });

  it("flags PA / PB / vc as pouvoir markers (not kaio/enfer labels)", () => {
    expect(parseCarddassFrFaceFile("D-021 PA copie.jpg")).toMatchObject({
      kind: "pouvoir",
      marker: "pa",
    });
    expect(parseCarddassFrFaceFile("D-434-PB.jpg")).toMatchObject({
      kind: "pouvoir",
      marker: "pb",
    });
    expect(parseCarddassFrFaceFile("D-662-vc.jpg")).toMatchObject({
      kind: "pouvoir",
      marker: "vc",
    });
  });

  it("rejects illustrator sources", () => {
    expect(parseCarddassFrFaceFile("D-635.ai")).toBeNull();
  });

  it("parses captioned cartes_med SP filenames as plain", () => {
    expect(parseCarddassFrFaceFile("SP-4.jpg")).toEqual({
      printed: "SP-4",
      number: "sp0004",
      kind: "plain",
      marker: null,
    });
    expect(parseCarddassFrFaceFile("DB Carte promo SP-22.jpg")).toEqual({
      printed: "SP-22",
      number: "sp0022",
      kind: "plain",
      marker: null,
    });
    expect(parseCarddassFrFaceFile("DB Carte promo SP-25.jpg")).toEqual({
      printed: "SP-25",
      number: "sp0025",
      kind: "plain",
      marker: null,
    });
  });
});

describe("selectCarddassFrInstallRows", () => {
  it("prefers exact D-###.jpg over copie for the same series+number", () => {
    const rows = selectCarddassFrInstallRows([
      {
        series: "4",
        file: "D-099 copie.jpg",
        timestamp: "1",
        waybackUrl: "https://web.archive.org/web/1id_/http://x/D-099%20copie.jpg",
      },
      {
        series: "4",
        file: "D-099.jpg",
        timestamp: "2",
        waybackUrl: "https://web.archive.org/web/2id_/http://x/D-099.jpg",
      },
      {
        series: "4",
        file: "D-021 PA copie.jpg",
        timestamp: "3",
        waybackUrl: "https://web.archive.org/web/3id_/http://x/PA.jpg",
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      number: "d0099",
      setHint: "part4",
      file: "D-099.jpg",
    });
  });

  it("selects Hors-série SP rows onto setHint sp", () => {
    const rows = selectCarddassFrInstallRows([
      {
        series: "sp",
        file: "SP-4.jpg",
        timestamp: "1",
        waybackUrl: "https://web.archive.org/web/1id_/http://x/SP-4.jpg",
      },
      {
        series: "sp",
        file: "DB Carte promo SP-22.jpg",
        timestamp: "2",
        waybackUrl: "https://web.archive.org/web/2id_/http://x/SP-22.jpg",
      },
    ]);
    expect(rows).toEqual([
      expect.objectContaining({
        number: "sp0004",
        setHint: "sp",
        file: "SP-4.jpg",
      }),
      expect.objectContaining({
        number: "sp0022",
        setHint: "sp",
        file: "DB Carte promo SP-22.jpg",
      }),
    ]);
  });
});

describe("matchCarddassFrToDbsjccPrint", () => {
  const part1: DbsjccPrintCandidate = {
    printKey: "dbsjcc:part1-d0001",
    setCode: "part1",
    number: "d0001",
    grouping: null,
  };

  it("matches series hint onto partN", () => {
    expect(matchCarddassFrToDbsjccPrint("d0001", "part1", [part1])).toEqual({
      kind: "match",
      print: part1,
    });
  });

  it("skips instead of minting when FR print is missing", () => {
    expect(matchCarddassFrToDbsjccPrint("d0584", "part7", [])).toEqual({
      kind: "skip",
      reason: "no FR print for d0584 in part7",
    });
  });

  it("skips ambiguous pouvoirs in the same set", () => {
    const variants: DbsjccPrintCandidate[] = [
      {
        printKey: "dbsjcc:part4-d0431-kaio",
        setCode: "part4",
        number: "d0431",
        grouping: "kaio",
      },
      {
        printKey: "dbsjcc:part4-d0431-enfer",
        setCode: "part4",
        number: "d0431",
        grouping: "enfer",
      },
    ];
    expect(matchCarddassFrToDbsjccPrint("d0431", "part4", variants)).toEqual({
      kind: "skip",
      reason: "ambiguous d0431 in part4 (2 prints)",
    });
  });
});
