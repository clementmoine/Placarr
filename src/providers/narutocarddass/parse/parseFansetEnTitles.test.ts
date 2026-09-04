import { describe, expect, it } from "vitest";

import type { NarutoPrintRow, NarutoTitleRow } from "../indexStore";
import {
  fansetEnTitleCards,
  mergeFansetEnTitlesIntoIndex,
} from "./parseFansetEnTitles";

function print(number: string, set = "fanset"): NarutoPrintRow {
  return {
    printKey: `naruto:${number}`,
    setCode: set,
    number,
    cardType: number.slice(0, 1),
  };
}

describe("fansetEnTitleCards", () => {
  it("covers validated C/N/M/J 5000+ fanset batches", () => {
    const cards = fansetEnTitleCards();
    expect(cards).toHaveLength(115);
    expect(cards.find((r) => r.number === "c5003")?.name).toBe("Izuna Uchiha");
    expect(cards.find((r) => r.number === "n5000")?.name).toBe(
      "The Second Mizukage",
    );
    expect(cards.find((r) => r.number === "m5000")?.name).toBe("A New Arrival");
    expect(cards.find((r) => r.number === "j5000")?.name).toBe(
      "Earth Style: Mud Fall",
    );
    expect(cards.find((r) => r.number === "j5018")?.name).toBe(
      "Water Gun: Double Blast",
    );
  });
});

describe("mergeFansetEnTitlesIntoIndex", () => {
  it("fills EN on existing fanset prints only", () => {
    const merged = mergeFansetEnTitlesIntoIndex({
      prints: [print("c-5001"), print("c-5002")],
      titles: [],
    });
    expect(merged.titled).toEqual(["naruto:c-5001", "naruto:c-5002"]);
    expect(merged.titles[0]).toMatchObject({
      printKey: "naruto:c-5001",
      lang: "en",
      fullName: "Gengo",
      nameSource: "fanset-ocr-validated",
    });
  });

  it("does not overwrite an attested EN title", () => {
    const kept: NarutoTitleRow = {
      printKey: "naruto:c-5001",
      lang: "en",
      fullName: "Already named",
    };
    const merged = mergeFansetEnTitlesIntoIndex({
      prints: [print("c-5001")],
      titles: [kept],
    });
    expect(merged.titled).toEqual([]);
    expect(merged.titles).toEqual([kept]);
  });

  it("re-syncs a prior fanset-ocr-validated title from the ledger", () => {
    const stale: NarutoTitleRow = {
      printKey: "naruto:n-5002",
      lang: "en",
      fullName: "Five Hungty Sharks",
      nameSource: "fanset-ocr-validated",
    };
    const merged = mergeFansetEnTitlesIntoIndex({
      prints: [print("n-5002")],
      titles: [stale],
    });
    expect(merged.titled).toEqual(["naruto:n-5002"]);
    expect(merged.titles[0]?.fullName).toBe("Five Hungry Sharks");
  });

  it("skips prints absent from the index", () => {
    const merged = mergeFansetEnTitlesIntoIndex({
      prints: [print("c-9999")],
      titles: [],
    });
    expect(merged.titled).toEqual([]);
  });
});
