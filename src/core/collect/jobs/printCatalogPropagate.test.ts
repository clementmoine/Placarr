import { describe, expect, it, vi } from "vitest";

vi.mock("@/core/catalog/catalog", () => ({
  getCatalogProviderModule: (id: string) => {
    if (id === "lorcanatcg") {
      return { printGames: ["lorcana"] };
    }
    if (id === "empty") return { printGames: [] };
    return null;
  },
}));

import { printKeyPrefixesForProvider } from "./printCatalogPropagate";

describe("printKeyPrefixesForProvider", () => {
  it("maps printGames to printKey prefixes", () => {
    expect(printKeyPrefixesForProvider("lorcanatcg")).toEqual(["lorcana:"]);
  });

  it("returns empty when the module has no printGames", () => {
    expect(printKeyPrefixesForProvider("empty")).toEqual([]);
    expect(printKeyPrefixesForProvider("missing")).toEqual([]);
  });
});
