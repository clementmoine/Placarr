import { describe, expect, it } from "vitest";

import {
  isPrintPickerListMode,
  printPickerActiveSearchQuery,
  printPickerListLines,
} from "./printPickerListMode";

describe("printPickerListMode", () => {
  it("stays single-line for one name", () => {
    expect(isPrintPickerListMode("Pikachu")).toBe(false);
    expect(printPickerListLines("Pikachu")).toEqual(["Pikachu"]);
    expect(printPickerActiveSearchQuery("Pikachu", 0)).toBe("Pikachu");
  });

  it("enters list mode once two non-empty lines exist", () => {
    const raw = "Pikachu\nDracaufeu";
    expect(isPrintPickerListMode(raw)).toBe(true);
    expect(printPickerListLines(raw)).toEqual(["Pikachu", "Dracaufeu"]);
    expect(printPickerActiveSearchQuery(raw, 0)).toBe("Pikachu");
    expect(printPickerActiveSearchQuery(raw, 1)).toBe("Dracaufeu");
  });

  it("ignores blank lines when detecting list mode", () => {
    expect(isPrintPickerListMode("Pikachu\n\n")).toBe(false);
    expect(isPrintPickerListMode("Pikachu\n\nMew")).toBe(true);
  });

  it("clamps the active line index", () => {
    const raw = "a\nb\nc";
    expect(printPickerActiveSearchQuery(raw, 99)).toBe("c");
    expect(printPickerActiveSearchQuery(raw, -1)).toBe("a");
  });
});
