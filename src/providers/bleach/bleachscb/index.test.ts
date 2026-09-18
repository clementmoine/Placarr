import { describe, expect, it } from "vitest";

import { bleachscbModule } from "./index";
import {
  formatBleachScbReference,
  parseBleachScbPrinted,
  bleachScbPrintKey,
} from "./printKey";

describe("bleachscb", () => {
  it("declares local catalogue surface", () => {
    expect(bleachscbModule.info.id).toBe("bleachscb");
    expect(bleachscbModule.catalog?.dataPack).toBe("bleach/scb");
    expect(bleachscbModule.printGames).toEqual(["bleachscb"]);
  });

  it("parses FR and JP printed refs", () => {
    expect(parseBleachScbPrinted("A001")).toEqual({
      set: "a",
      number: "001",
      printed: "A001",
    });
    // Hyphenated A-### = JP Ability, not FR âme.
    expect(parseBleachScbPrinted("A-029")).toEqual({
      set: "ability",
      number: "029",
      printed: "A-029",
    });
    // JP events keep the hyphen on nikita; same letter namespace as FR E###.
    expect(parseBleachScbPrinted("E-007")).toEqual({
      set: "e",
      number: "007",
      printed: "E007",
    });
    expect(parseBleachScbPrinted("Z-023")).toEqual({
      set: "z",
      number: "023",
      printed: "Z023",
    });
    expect(parseBleachScbPrinted("J-011")).toEqual({
      set: "j",
      number: "011",
      printed: "J-011",
    });
    expect(parseBleachScbPrinted("S-12")).toEqual({
      set: "s",
      number: "012",
      printed: "S-012",
    });
    expect(bleachScbPrintKey("a", "001")).toBe("bleachscb:a-001");
    expect(bleachScbPrintKey("ability", "029")).toBe("bleachscb:ability-029");
    expect(bleachScbPrintKey("j", "011")).toBe("bleachscb:j-011");
    expect(bleachScbPrintKey("s", "001")).toBe("bleachscb:s-001");
    expect(formatBleachScbReference("a", "001")).toBe("A001");
    expect(formatBleachScbReference("ability", "029")).toBe("A-029");
    expect(formatBleachScbReference("j", "011")).toBe("J-011");
  });

  it("offers JA original + FR after nikita seed", async () => {
    const langs = (await bleachscbModule.listPrintLanguages?.("tcg")) ?? [];
    expect(langs).toEqual(expect.arrayContaining(["ja", "fr"]));
    const ichigo = await bleachscbModule.searchPrints!({
      query: "黒崎",
      language: "ja",
      limit: 5,
    });
    expect(ichigo.some((row) => row.printKey === "bleachscb:s-002")).toBe(true);
  });

  it("does not claim DBH or JCC prints", async () => {
    await expect(
      bleachscbModule.lookupPrint!({ printKey: "dbh:h1-01" }),
    ).resolves.toBeNull();
    await expect(
      bleachscbModule.lookupPrint!({ printKey: "dbsjcc:part1-d0001" }),
    ).resolves.toBeNull();
  });
});
