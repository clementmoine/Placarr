import { describe, expect, it } from "vitest";

import { isExactOwnedRow, ownedRowKey } from "./printPickerOwned";

describe("printPicker hideOwned filter", () => {
  it("hides the exact finish but keeps other finishes of the same print", () => {
    const exact = new Set([
      ownedRowKey("naruto:ni-0001", "normal", "fr", "s1"),
    ]);
    const normal = {
      printKey: "naruto:ni-0001",
      finish: "normal",
      language: "fr",
      setCode: "s1",
    };
    const holo = {
      printKey: "naruto:ni-0001",
      finish: "holo",
      language: "fr",
      setCode: "s1",
    };
    expect(isExactOwnedRow(normal, exact)).toBe(true);
    expect(isExactOwnedRow(holo, exact)).toBe(false);

    const visible = [normal, holo].filter(
      (row) => !isExactOwnedRow(row, exact),
    );
    expect(visible).toEqual([holo]);
  });
});
