import { describe, expect, it } from "vitest";

import { DBS_JCC_FULL_FOIL_MASK_URL } from "@/effects/dbsjcc";

import {
  dbsjccFinishForPrint,
  dbsjccFinishFromRarity,
  decorateDbsjccCandidate,
  isDbsjccHorsSerieRarityLabel,
} from "./finishes";

describe("dbsjcc finishes", () => {
  it("maps Holo / Prism rarities onto house finishes", () => {
    expect(dbsjccFinishFromRarity("Holo")).toBe("holo");
    expect(dbsjccFinishFromRarity("Holographique")).toBe("holo");
    expect(dbsjccFinishFromRarity("Prism")).toBe("prism");
    expect(dbsjccFinishFromRarity("Commune")).toBeNull();
    expect(dbsjccFinishFromRarity("Rare")).toBeNull();
  });

  it("treats SP « Hors série » channel label as holo foil", () => {
    expect(isDbsjccHorsSerieRarityLabel("Hors série")).toBe(true);
    expect(isDbsjccHorsSerieRarityLabel("Hors-série")).toBe(true);
    expect(dbsjccFinishForPrint("sp", "Hors série")).toBe("holo");
    expect(dbsjccFinishForPrint("promo", "Hors série")).toBeNull();
    expect(dbsjccFinishForPrint("sp", "Commune")).toBeNull();
  });

  it("stamps foil mask + single finish on holo prints", () => {
    const out = decorateDbsjccCandidate(
      {
        printKey: "dbsjcc:part1-d0030",
        title: "Roi piccolo",
        reference: "D-30",
        rarity: "Holo",
        effectPack: "dbs-jcc",
      },
      {
        printKey: "dbsjcc:part1-d0030",
        setCode: "part1",
        number: "d0030",
        cardType: "part1",
        grouping: null,
        lang: "fr",
        fullName: "Roi piccolo",
        rarity: "Holo",
        category: null,
        art: null,
        thumb: null,
        back: null,
      },
    );
    expect(out.finishes).toEqual(["holo"]);
    expect(out.plainFinishes).toEqual(["None"]);
    expect(out.foilMaskUrl).toBe(DBS_JCC_FULL_FOIL_MASK_URL);
  });

  it("stamps holo finish on SP Hors série (e.g. SP-25 Vegeto)", () => {
    const out = decorateDbsjccCandidate(
      {
        printKey: "dbsjcc:sp-sp0025",
        title: "Vegeto",
        reference: "SP-25",
        rarity: "Hors série",
        effectPack: "dbs-jcc",
      },
      {
        printKey: "dbsjcc:sp-sp0025",
        setCode: "sp",
        number: "sp0025",
        cardType: "sp",
        grouping: null,
        lang: "fr",
        fullName: "Vegeto",
        rarity: "Hors série",
        category: null,
        art: null,
        thumb: null,
        back: null,
      },
    );
    expect(out.rarity).toBe("Holo");
    expect(out.finishes).toEqual(["holo"]);
    expect(out.plainFinishes).toEqual([]);
    expect(out.foilMaskUrl).toBe(DBS_JCC_FULL_FOIL_MASK_URL);
  });

  it("leaves communes flat", () => {
    const out = decorateDbsjccCandidate(
      {
        printKey: "dbsjcc:part1-d0001",
        title: "Goku",
        reference: "D-1",
        rarity: "Commune",
        effectPack: "dbs-jcc",
      },
      {
        printKey: "dbsjcc:part1-d0001",
        setCode: "part1",
        number: "d0001",
        cardType: "part1",
        grouping: null,
        lang: "fr",
        fullName: "Goku",
        rarity: "Commune",
        category: null,
        art: null,
        thumb: null,
        back: null,
      },
    );
    expect(out.finishes).toBeUndefined();
    expect(out.foilMaskUrl).toBeUndefined();
  });
});
