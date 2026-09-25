/**
 * carddass.fr face parse / match / install-row selection.
 */
import { describe, expect, it } from "vitest";

import {
  carddassFrSeriesToSetHint,
  matchCarddassFrToDbsjccPrint,
  parseCarddassFrFaceFile,
  selectCarddassFrInstallRows,
} from "../harvest/carddassFr";
import type { DbsjccPrintCandidate } from "../harvest/chitoroshop";

describe("carddassFrSeriesToSetHint", () => {
  it("maps series 1–10 to partN", () => {
    expect(carddassFrSeriesToSetHint("1")).toBe("part1");
    expect(carddassFrSeriesToSetHint("10")).toBe("part10");
    expect(carddassFrSeriesToSetHint("11")).toBeNull();
    expect(carddassFrSeriesToSetHint("promo")).toBeNull();
  });
});

describe("parseCarddassFrFaceFile", () => {
  it("parses plain D-### and D### filenames", () => {
    expect(parseCarddassFrFaceFile("D-001.jpg")).toEqual({
      printed: "D-1",
      number: "d0001",
      kind: "plain",
    });
    expect(parseCarddassFrFaceFile("D728.jpg")).toEqual({
      printed: "D-728",
      number: "d0728",
      kind: "plain",
    });
  });

  it("treats bare copie as plain re-upload", () => {
    expect(parseCarddassFrFaceFile("D-099 copie.jpg")).toEqual({
      printed: "D-99",
      number: "d0099",
      kind: "plain",
    });
  });

  it("flags PA / PB / vc as pouvoir", () => {
    expect(parseCarddassFrFaceFile("D-021 PA copie.jpg")?.kind).toBe("pouvoir");
    expect(parseCarddassFrFaceFile("D-434-PB.jpg")?.kind).toBe("pouvoir");
    expect(parseCarddassFrFaceFile("D-662-vc.jpg")?.kind).toBe("pouvoir");
  });

  it("rejects illustrator sources", () => {
    expect(parseCarddassFrFaceFile("D-635.ai")).toBeNull();
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
