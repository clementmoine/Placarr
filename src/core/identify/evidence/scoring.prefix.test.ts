import { describe, expect, it } from "vitest";

import { BOOK_BARCODE_PREFIX } from "./scoring";

describe("GS1 Bookland prefix", () => {
  it("recognises ISBN-13 EAN ranges only", () => {
    expect(BOOK_BARCODE_PREFIX.test("9780140328721")).toBe(true);
    expect(BOOK_BARCODE_PREFIX.test("9791234567890")).toBe(true);
    expect(BOOK_BARCODE_PREFIX.test("4981234567890")).toBe(false);
    expect(BOOK_BARCODE_PREFIX.test("045496365226")).toBe(false);
  });
});
