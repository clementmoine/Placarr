import { describe, expect, it } from "vitest";

import { isCardBackUrl, normalizeCardBackUrl } from "@/core/collect/cardBack";

describe("normalizeCardBackUrl", () => {
  it("keeps an uploaded image's path", () => {
    // The bug this file exists for: the form uploaded the picked file, sent
    // back the resulting path, and the API dropped it as "not a URL".
    expect(normalizeCardBackUrl("/uploads/9f2c.png")).toBe("/uploads/9f2c.png");
  });

  it("keeps an address to hotlink", () => {
    expect(normalizeCardBackUrl("https://example.test/back.webp")).toBe(
      "https://example.test/back.webp",
    );
    expect(normalizeCardBackUrl("http://example.test/back.webp")).toBe(
      "http://example.test/back.webp",
    );
  });

  it("trims what it keeps", () => {
    expect(normalizeCardBackUrl("  /uploads/9f2c.png  ")).toBe(
      "/uploads/9f2c.png",
    );
  });

  it("reads an empty field as: these cards do not turn over", () => {
    expect(normalizeCardBackUrl("")).toBeNull();
    expect(normalizeCardBackUrl("   ")).toBeNull();
    expect(normalizeCardBackUrl(null)).toBeNull();
    expect(normalizeCardBackUrl(undefined)).toBeNull();
  });

  it("refuses anything else a URL bar would take", () => {
    // The value becomes an `<img src>`, so the narrowness is the point.
    expect(normalizeCardBackUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeCardBackUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(normalizeCardBackUrl("example.test/back.webp")).toBeNull();
    expect(normalizeCardBackUrl("/other/back.webp")).toBeNull();
    expect(normalizeCardBackUrl("uploads/back.webp")).toBeNull();
  });

  it("refuses a traversal dressed up as an upload", () => {
    expect(normalizeCardBackUrl("/uploads/../../etc/passwd")).toBeNull();
    expect(normalizeCardBackUrl("/uploads/..\\secrets")).toBeNull();
  });

  it("refuses values that are not strings at all", () => {
    expect(normalizeCardBackUrl(42)).toBeNull();
    expect(normalizeCardBackUrl({ url: "https://example.test" })).toBeNull();
  });
});

describe("isCardBackUrl", () => {
  it("agrees with the normalizer, so form and API cannot drift", () => {
    for (const value of [
      "/uploads/9f2c.png",
      "https://example.test/back.webp",
      "example.test",
      "",
      "/uploads/../x",
    ]) {
      expect(isCardBackUrl(value)).toBe(normalizeCardBackUrl(value) !== null);
    }
  });
});
