import { describe, expect, it } from "vitest";

import {
  formatNinjaRanksReference,
  ninjaRanksPrintKey,
  ninjaRanksSetLabel,
  ninjaRanksSetSortKey,
  normalizeNinjaRanksSearchQuery,
} from "./printKey";
import { readInkworksChecklist } from "./buildFromLedgers";

describe("ninjaRanksPrintKey", () => {
  it("mints keys from the official collector numbers", () => {
    expect(ninjaRanksPrintKey("nr", "0001")).toBe("naruto:nr-0001");
    expect(ninjaRanksPrintKey("ff", "0001")).toBe("naruto:ff-0001");
    expect(ninjaRanksPrintKey("pn", "t")).toBe("naruto:pn-t");
    expect(ninjaRanksPrintKey("pn", "ga")).toBe("naruto:pn-ga");
    expect(ninjaRanksPrintKey("pn", "i")).toBe("naruto:pn-i");
    expect(ninjaRanksPrintKey("pn", "sd2006")).toBe("naruto:pn-sd2006");
  });

  it("formats the Inkworks printed refs", () => {
    expect(formatNinjaRanksReference("nr", "0008")).toBe("8");
    expect(formatNinjaRanksReference("ff", "0001")).toBe("FF-1");
    expect(formatNinjaRanksReference("nw", "0009")).toBe("NW-9");
    expect(formatNinjaRanksReference("ns", "0001")).toBe("NS-1");
    expect(formatNinjaRanksReference("pn", "0001")).toBe("PN-1");
    expect(formatNinjaRanksReference("pn", "t")).toBe("PN-T");
    expect(formatNinjaRanksReference("pn", "ga")).toBe("PN-GA");
    expect(formatNinjaRanksReference("pn", "i")).toBe("PN-i");
    expect(formatNinjaRanksReference("pn", "sd2006")).toBe("PN-SD2006");
    expect(formatNinjaRanksReference("bl", "0001")).toBe("BL-1");
    expect(formatNinjaRanksReference("bl", "0001", null, "en")).toBe("BL-1");
  });

  it("formats Group Seven refs for European locales", () => {
    expect(formatNinjaRanksReference("bl", "0001", null, "fr")).toBe("GS-1");
    expect(formatNinjaRanksReference("bl", "0002", null, "it")).toBe("GS-2");
    expect(formatNinjaRanksReference("bl", "0003", null, "FR")).toBe("GS-3");
    // Autres inserts inchangés en EU.
    expect(formatNinjaRanksReference("nw", "0001", null, "fr")).toBe("NW-1");
  });

  it("labels Group Seven in FR/IT, Box Loaders in EN", () => {
    expect(ninjaRanksSetLabel("bl")).toBe("Box Loaders");
    expect(ninjaRanksSetLabel("bl", "en")).toBe("Box Loaders");
    expect(ninjaRanksSetLabel("bl", "fr")).toBe("Group Seven");
    expect(ninjaRanksSetLabel("bl", "it")).toBe("Group Seven");
    expect(ninjaRanksSetLabel("nr", "fr")).toBe("Ninja Ranks");
  });

  it("orders the 2006 subsets as Inkworks listed them", () => {
    expect(ninjaRanksSetLabel("nr")).toBe("Ninja Ranks");
    expect(ninjaRanksSetLabel("ns")).toBe("Ninja Sensei");
    expect(
      ["pn", "nr", "ff", "ns", "bl"].sort(
        (a, b) =>
          (ninjaRanksSetSortKey(a) ?? 99) - (ninjaRanksSetSortKey(b) ?? 99),
      ),
    ).toEqual(["nr", "ff", "ns", "bl", "pn"]);
  });

  it("normalizes GS/BL collector queries onto the bl print_key fragment", () => {
    expect(normalizeNinjaRanksSearchQuery("GS1")).toBe("bl-0001");
    expect(normalizeNinjaRanksSearchQuery("GS-2")).toBe("bl-0002");
    expect(normalizeNinjaRanksSearchQuery("gs03")).toBe("bl-0003");
    expect(normalizeNinjaRanksSearchQuery("BL-1")).toBe("bl-0001");
    expect(normalizeNinjaRanksSearchQuery("gs")).toBe("bl");
    expect(normalizeNinjaRanksSearchQuery("Naruto")).toBe("Naruto");
  });
});

describe("Inkworks checklist ledger", () => {
  it("holds the official 100 cards and no European extras", () => {
    const ledger = readInkworksChecklist();
    expect(ledger.cards).toHaveLength(100);
    expect(ledger.cards.filter((c) => c.setCode === "nr")).toHaveLength(72);
    expect(ledger.cards.filter((c) => c.setCode === "ff")).toHaveLength(6);
    expect(ledger.cards.filter((c) => c.setCode === "sd")).toHaveLength(6);
    expect(ledger.cards.filter((c) => c.setCode === "nw")).toHaveLength(9);
    expect(ledger.cards.filter((c) => c.setCode === "bl")).toHaveLength(3);
    expect(ledger.cards.filter((c) => c.setCode === "pn")).toHaveLength(4);
    expect(ledger.cards.map((c) => c.printed)).not.toContain("NS-1");
    expect(ledger.cards[0]).toMatchObject({
      printed: "1",
      name: "Title Card",
    });
    expect(ledger.cards.find((c) => c.printed === "NW-9")?.name).toBe(
      "Rock lee",
    );
    const keys = ledger.cards.map((c) =>
      ninjaRanksPrintKey(c.setCode, c.number),
    );
    expect(keys.every(Boolean)).toBe(true);
    expect(new Set(keys).size).toBe(100);
  });
});
