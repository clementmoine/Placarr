/**
 * Official DON!! cardlist → printKeys (no live download).
 */
import { describe, expect, it } from "vitest";

import {
  buildDonCardlistPrintWrites,
  donCollectorId,
  normalizeDonProductSetCode,
  type DonCardlistLedger,
} from "./donCardlist";
import { onepiecePrintKey } from "./printIdentity";

describe("donCollectorId / printKey", () => {
  it("maps PDF order onto Bandai-shaped DON-NNN keys", () => {
    expect(donCollectorId(1)).toBe("DON-001");
    expect(donCollectorId(90)).toBe("DON-090");
    expect(onepiecePrintKey(donCollectorId(1))).toBe("onepiece:don-001");
    expect(onepiecePrintKey(donCollectorId(262))).toBe("onepiece:don-262");
  });
});

describe("normalizeDonProductSetCode", () => {
  it.each([
    ["PRB-01", "prb01"],
    ["OP14", "op14"],
    ["OP-01", "op01"],
    ["ST-10", "st10"],
    ["EB-02", "eb02"],
    [null, null],
    ["", null],
  ] as const)("%s → %s", (raw, expected) => {
    expect(normalizeDonProductSetCode(raw)).toBe(expected);
  });
});

describe("buildDonCardlistPrintWrites", () => {
  const ledger: DonCardlistLedger = {
    uniqueCards: 2,
    sourceUrl: "https://www.onepiece-cardgame.com/pdf/don-cardlist.pdf",
    cards: [
      {
        donIndex: 1,
        page: 1,
        slot: 1,
        labelJa: "通常デザイン",
        productCode: null,
        file: "cards/001.jpeg",
      },
      {
        donIndex: 33,
        page: 4,
        slot: 6,
        labelJa: "プレミアムブースター ONE PIECE CARD THE BEST【PRB-01】",
        productCode: "PRB-01",
        file: "cards/033_prb-01.jpeg",
      },
    ],
  };

  it("seeds DON!! category with ja product caption + en code title", () => {
    const writes = buildDonCardlistPrintWrites(ledger);
    expect(writes).toHaveLength(2);

    const base = writes.find((w) => w.printKey === "onepiece:don-001");
    expect(base).toMatchObject({
      setCode: "don",
      number: "001",
      category: "DON!!",
      cardType: "don",
    });
    expect(base?.setCodes).toBeUndefined();
    expect(base?.titles.find((t) => t.lang === "ja")?.fullName).toBe(
      "通常デザイン",
    );
    expect(base?.titles.find((t) => t.lang === "en")?.fullName).toBe("DON!!");

    const prb = writes.find((w) => w.printKey === "onepiece:don-033");
    expect(prb?.setCodes).toEqual(["don", "prb01"]);
    expect(prb?.titles.find((t) => t.lang === "en")).toMatchObject({
      fullName: "DON!! (PRB-01)",
      rarity: "PRB-01",
    });
    expect(prb?.titles.find((t) => t.lang === "ja")?.fullName).toContain(
      "PRB-01",
    );
  });
});
