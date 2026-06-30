import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * HONEST-EMPTY lock — the other half of the product golden rule.
 *
 * `compile.confidenceLock.test.ts` pins that a confidently-resolved barcode keeps
 * the right leader/platform/confidence. This file pins the inverse, which the rule
 * weighs even more heavily: **"vide honnête OK, faux positif confiant interdit."**
 * When no canonical/trusted source confirms the barcode and the database fallback
 * misses, `compileResultForType` must return `null` (honest empty) — it must never
 * fabricate a confident item out of marketplace names alone, however many sellers
 * happen to agree (majority-noise; see docs/unbiased_ranking.md §4).
 *
 * The database fallback (`confrontWithDatabase`) is mocked to a miss so the cases
 * are deterministic and network-free. If a deliberate change moves one of these,
 * update it in the same commit — never delete the assertion.
 */

const h = vi.hoisted(() => ({
  confrontWithDatabase: vi.fn(),
}));

vi.mock("@/services/metadata/database", () => ({
  confrontWithDatabase: h.confrontWithDatabase,
}));

import { compileResultForType } from "./compile";

type Src = {
  providerName: string;
  products: { name: string; platformKey?: string }[];
};

const compile = (barcode: string, sources: Src[]) =>
  compileResultForType("games", sources, barcode);

beforeEach(() => {
  h.confrontWithDatabase.mockReset();
  // Database miss: the fallback never confirms the barcode.
  h.confrontWithDatabase.mockResolvedValue(null);
});

describe("honest-empty (no anchor + database miss → null)", () => {
  it("a lone marketplace listing never becomes a confident guess", async () => {
    const result = await compile("3760000000017", [
      {
        providerName: "eBay",
        products: [{ name: "Speedy Racer Deluxe", platformKey: "wii" }],
      },
    ]);

    expect(result).toBeNull();
  });

  it("several independent marketplaces agreeing is still not an anchor", async () => {
    // Three distinct marketplaces name the same product — a pure consensus of
    // listings. With no canonical/trusted source and a database miss, that
    // consensus must NOT be promoted into a confident item (majority noise).
    const result = await compile("3760000000024", [
      {
        providerName: "eBay",
        products: [{ name: "Speedy Racer Deluxe", platformKey: "wii" }],
      },
      {
        providerName: "AchatMoinsCher",
        products: [{ name: "Speedy Racer Deluxe", platformKey: "wii" }],
      },
      {
        providerName: "Freakxy",
        products: [{ name: "Speedy Racer Deluxe", platformKey: "wii" }],
      },
    ]);

    expect(result).toBeNull();
    // The database fallback was consulted and still produced nothing.
    expect(h.confrontWithDatabase).toHaveBeenCalled();
  });

  it("a cover or volume cannot substitute for a missing anchor", async () => {
    const result = await compile("3760000000031", [
      {
        providerName: "eBay",
        products: [
          { name: "Speedy Racer Deluxe Edition Collector", platformKey: "wii" },
          { name: "Speedy Racer Deluxe FR PAL", platformKey: "wii" },
        ],
      },
    ]);

    expect(result).toBeNull();
  });
});
