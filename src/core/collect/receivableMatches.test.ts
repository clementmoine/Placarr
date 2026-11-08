import { describe, expect, it } from "vitest";

import {
  findOwnedIdentityPeers,
  findReceivableByBarcode,
  findReceivableShelfMatches,
  pairReceivableAdds,
  pickPreferredReceivableMatch,
  printIdentityKey,
  resolveReceivableForCreate,
} from "@/core/collect/receivableMatches";

const base = {
  printKey: "lorcana:1-7",
  variant: "Normal",
  language: "fr",
  setCode: "1",
};

describe("printIdentityKey", () => {
  it("is set + print + language + finish", () => {
    expect(
      printIdentityKey("lorcana:1-7", "Normal", "fr", "1"),
    ).toBe("1|lorcana:1-7|fr|normal");
  });
});

describe("findReceivableShelfMatches", () => {
  it("matches away/wanted exact finish, ignores owned", () => {
    const items = [
      { id: "owned", name: "A", ...base, presence: "owned" as const },
      {
        id: "ordered",
        name: "B",
        ...base,
        presence: "away" as const,
        absenceReason: "ordered" as const,
      },
      {
        id: "wanted",
        name: "C",
        ...base,
        presence: "wanted" as const,
      },
      {
        id: "other-finish",
        name: "D",
        ...base,
        variant: "Cold Foil",
        presence: "away" as const,
        absenceReason: "ordered" as const,
      },
    ];
    const hits = findReceivableShelfMatches(items, base);
    expect(hits.map((h) => h.id).sort()).toEqual(["ordered", "wanted"]);
  });

  it("does not cross languages", () => {
    const items = [
      {
        id: "ja",
        name: "JA",
        ...base,
        language: "ja",
        presence: "away" as const,
        absenceReason: "ordered" as const,
      },
    ];
    expect(findReceivableShelfMatches(items, base)).toEqual([]);
  });
});

describe("pickPreferredReceivableMatch", () => {
  it("prefers ordered over wanted", () => {
    const pick = pickPreferredReceivableMatch([
      {
        id: "w",
        name: "W",
        ...base,
        presence: "wanted",
      },
      {
        id: "o",
        name: "O",
        ...base,
        presence: "away",
        absenceReason: "ordered",
      },
    ]);
    expect(pick?.id).toBe("o");
  });
});

describe("pairReceivableAdds", () => {
  it("consumes one match per row", () => {
    const items = [
      {
        id: "a",
        name: "A",
        ...base,
        presence: "away" as const,
        absenceReason: "ordered" as const,
      },
      {
        id: "b",
        name: "B",
        ...base,
        presence: "away" as const,
        absenceReason: "ordered" as const,
      },
    ];
    const { pairs, unmatchedIndexes } = pairReceivableAdds(items, [
      { ...base, title: "1" },
      { ...base, title: "2" },
      { ...base, title: "3" },
    ]);
    expect(pairs.map((p) => p.match.id)).toEqual(["a", "b"]);
    expect(unmatchedIndexes).toEqual([2]);
  });
});

describe("findOwnedIdentityPeers", () => {
  it("finds owned twins and skips self / away", () => {
    const items = [
      { id: "self", name: "Self", ...base, presence: "owned" as const },
      { id: "owned", name: "Owned", ...base, presence: "owned" as const },
      {
        id: "away",
        name: "Away",
        ...base,
        presence: "away" as const,
        absenceReason: "ordered" as const,
      },
    ];
    expect(
      findOwnedIdentityPeers(items, { ...base, excludeId: "self" }).map(
        (h) => h.id,
      ),
    ).toEqual(["owned"]);
  });
});

describe("findReceivableByBarcode", () => {
  it("matches away/wanted with barcode variants, ignores owned", () => {
    const items = [
      {
        id: "owned",
        name: "Owned",
        barcode: "0827912079678",
        presence: "owned" as const,
      },
      {
        id: "ordered",
        name: "Ordered",
        barcode: "827912079678",
        presence: "away" as const,
        absenceReason: "ordered" as const,
      },
      {
        id: "wanted",
        name: "Wanted",
        barcode: "0827912079678",
        presence: "wanted" as const,
      },
    ];
    expect(
      findReceivableByBarcode(items, "0827912079678").map((h) => h.id).sort(),
    ).toEqual(["ordered", "wanted"]);
  });
});

describe("resolveReceivableForCreate", () => {
  it("prefers print identity over barcode", () => {
    const items = [
      {
        id: "by-barcode",
        name: "Barcode hit",
        barcode: "111",
        printKey: "other:1",
        presence: "away" as const,
        absenceReason: "ordered" as const,
      },
      {
        id: "by-print",
        name: "Print hit",
        barcode: "222",
        ...base,
        presence: "away" as const,
        absenceReason: "ordered" as const,
      },
    ];
    expect(
      resolveReceivableForCreate(items, { ...base, barcode: "111" })?.id,
    ).toBe("by-print");
  });

  it("falls back to barcode when no printKey", () => {
    const items = [
      {
        id: "ordered",
        name: "O",
        barcode: "0827912079678",
        presence: "away" as const,
        absenceReason: "ordered" as const,
      },
    ];
    expect(
      resolveReceivableForCreate(items, { barcode: "0827912079678" })?.id,
    ).toBe("ordered");
  });
});
