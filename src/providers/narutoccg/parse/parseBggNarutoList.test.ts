import { describe, expect, it } from "vitest";

import tcdb from "../curated/sources/tcdb-en-ccg.json";
import {
  bggEnCcgPrinted,
  bggEnCcgS1Cards,
  bggEnCcgS1Ledger,
  mergeBggEnCcgS1IntoIndex,
} from "./parseBggNarutoList";

describe("BGG Path to Hokage checklist (2006 xls)", () => {
  it("is EN CCG Series 1 only — 127 rows, same count as TCDB, no faces", () => {
    const ledger = bggEnCcgS1Ledger();
    const cards = bggEnCcgS1Cards();
    expect(ledger.ingest).toBe("titles");
    expect(ledger.set.series).toBe(1);
    expect(ledger.set.title).toBe("The Path to Hokage");
    expect(ledger.file.sheet).toBe("Path to Hokage");
    expect(cards).toHaveLength(127);
    expect(ledger.counts).toEqual({
      cards: 127,
      N: 43,
      J: 42,
      M: 42,
      rarity: { C: 70, U: 25, ST: 12, R: 13, SR: 7 },
    });
    const s1 = tcdb.mainSets.find((row) => row.series === 1);
    expect(s1?.tcdbCards).toBe(127);
    expect(s1?.sid).toBe(ledger.tcdbSid);
    expect(ledger.urls.filepage).toBe(
      "https://boardgamegeek.com/filepage/20590/narutotcglistxls",
    );
    expect(JSON.stringify(ledger.urls)).not.toContain("download_redirect");
  });

  it("maps sheet type+number to printed Bandai codes, not PTH or NI", () => {
    const naruto = bggEnCcgS1Cards().find(
      (row) => row.type === "N" && row.number === "001",
    );
    const kunai = bggEnCcgS1Cards().find(
      (row) => row.type === "J" && row.number === "001",
    );
    expect(naruto?.name).toBe("Naruto Uzumaki");
    expect(kunai?.name).toBe("Kunai");
    expect(bggEnCcgPrinted(naruto!)).toEqual({
      cardType: "n",
      number: "n001",
      usExclusive: false,
    });
    expect(bggEnCcgPrinted(kunai!)).toEqual({
      cardType: "j",
      number: "j001",
      usExclusive: false,
    });
    expect(bggEnCcgS1Cards().every((row) => bggEnCcgPrinted(row))).toBe(true);
    expect(bggEnCcgS1Cards().some((row) => row.type === "NI")).toBe(false);
  });

  it("keeps the sheet error on N-028 and the 2006 typos", () => {
    const kiba = bggEnCcgS1Cards().find(
      (row) => row.type === "N" && row.number === "028",
    );
    expect(kiba?.name).toBe("Kiba Inuzuka");
    expect(kiba?.symbol).toBe("R");
    expect(bggEnCcgS1Ledger().observedSheetErrors).toEqual([
      {
        ref: "N-028",
        field: "symbol",
        value: "R",
        note: "R is a rarity letter, not an element",
      },
    ]);
    const names = bggEnCcgS1Cards().map((row) => row.name);
    expect(names).toContain("Transfrmation Jutsu");
    expect(names).toContain("Disquise Jutsu");
    expect(names).toContain("Crass-Shaped Shuriken");
  });

  it("mints EN CCG keys, not Carddass NI, and keeps sheet typos", () => {
    const merged = mergeBggEnCcgS1IntoIndex({
      prints: [
        {
          printKey: "naruto:ni-0001",
          setCode: "s1",
          number: "ni0001",
          cardType: "ni",
          family: "ninja",
        },
      ],
      titles: [
        {
          printKey: "naruto:ni-0001",
          lang: "fr",
          fullName: "Naruto Uzumaki",
        },
      ],
    });
    expect(merged.addedPrints).toContain("naruto:n-0001");
    expect(merged.addedPrints).toContain("naruto:j-0001");
    expect(merged.addedPrints).not.toContain("naruto:ni-0001");
    expect(
      merged.titles.find((t) => t.printKey === "naruto:n-0001"),
    ).toMatchObject({
      lang: "en",
      fullName: "Naruto Uzumaki",
    });
    expect(
      merged.titles.find((t) => t.printKey === "naruto:ni-0001")?.lang,
    ).toBe("fr");
    expect(
      merged.titles.find((t) => t.printKey === "naruto:j-0016")?.fullName,
    ).toBe("Transfrmation Jutsu");
    expect(
      merged.prints.find((p) => p.printKey === "naruto:n-0001"),
    ).toMatchObject({
      setCode: "s1",
      number: "n0001",
      family: "ninja",
    });
  });
});
