import { describe, expect, it } from "vitest";

import { overscanFilterPage } from "./catalogueOverscan";

describe("overscanFilterPage", () => {
  it("does not cap total at the first filled page", () => {
    const source = Array.from({ length: 200 }, (_, i) => i);
    const fetchPage = (offset: number, limit: number) => ({
      rows: source.slice(offset, offset + limit),
      total: source.length,
    });
    // Keep every 2nd item → 100 matches.
    const keep = (n: number) => n % 2 === 0;

    const small = overscanFilterPage({
      offset: 0,
      limit: 10,
      maxScan: 1_000,
      fetchPage,
      keep,
    });
    const large = overscanFilterPage({
      offset: 0,
      limit: 80,
      maxScan: 1_000,
      fetchPage,
      keep,
    });

    expect(small.rows).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
    expect(small.total).toBe(100);
    expect(large.total).toBe(100);
    expect(large.rows).toHaveLength(80);
  });

  it("pages with an honest offset into the filtered stream", () => {
    const source = Array.from({ length: 50 }, (_, i) => i);
    const page = overscanFilterPage({
      offset: 5,
      limit: 3,
      maxScan: 1_000,
      fetchPage: (offset, limit) => ({
        rows: source.slice(offset, offset + limit),
        total: source.length,
      }),
      keep: (n) => n % 2 === 0,
    });
    expect(page.rows).toEqual([10, 12, 14]);
    expect(page.total).toBe(25);
  });
});
