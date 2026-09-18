import { describe, expect, it } from "vitest";

import {
  isItemOnLoan,
  loanedAtInputValue,
  normalizeItemLoanInput,
} from "./itemLoan";

describe("isItemOnLoan", () => {
  it("is true only when a borrower name is set", () => {
    expect(isItemOnLoan({ loanedTo: "Alice", loanedAt: new Date() })).toBe(
      true,
    );
    expect(isItemOnLoan({ loanedTo: "  ", loanedAt: new Date() })).toBe(false);
    expect(isItemOnLoan({ loanedTo: null, loanedAt: null })).toBe(false);
  });
});

describe("loanedAtInputValue", () => {
  it("formats a date for date inputs", () => {
    expect(loanedAtInputValue(new Date(2026, 8, 6))).toBe("2026-09-06");
    expect(loanedAtInputValue(null)).toBe("");
  });
});

describe("normalizeItemLoanInput", () => {
  it("returns undefined when neither field is present", () => {
    expect(normalizeItemLoanInput({})).toBeUndefined();
  });

  it("clears both fields when the borrower is empty", () => {
    expect(
      normalizeItemLoanInput({ loanedTo: "", loanedAt: "2026-09-01" }),
    ).toEqual({ loanedTo: null, loanedAt: null });
  });

  it("defaults the date to today when only the borrower is set", () => {
    const result = normalizeItemLoanInput({ loanedTo: "Bob" });
    expect(result?.loanedTo).toBe("Bob");
    expect(result?.loanedAt).toBeInstanceOf(Date);
  });

  it("parses an explicit date string", () => {
    const result = normalizeItemLoanInput({
      loanedTo: "Bob",
      loanedAt: "2026-01-15",
    });
    expect(result?.loanedTo).toBe("Bob");
    expect(loanedAtInputValue(result?.loanedAt)).toBe("2026-01-15");
  });
});
