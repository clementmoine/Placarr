import { beforeEach, describe, expect, it, vi } from "vitest";

const httpGet = vi.fn();

vi.mock("@/lib/http/httpClient", () => ({
  httpGet: (...args: unknown[]) => httpGet(...args),
}));

import { __resetTcgdexSetSerieCacheForTests, tcgdexSetSerie } from "./setMeta";

describe("tcgdexSetSerie", () => {
  beforeEach(() => {
    httpGet.mockReset();
    __resetTcgdexSetSerieCacheForTests();
  });

  it("reads serie.name from the set endpoint and caches it", async () => {
    httpGet.mockResolvedValueOnce({
      data: {
        id: "sm9",
        name: "Duo de Choc",
        serie: { id: "sm", name: "Soleil et Lune" },
      },
    });

    const first = await tcgdexSetSerie("sm9", "fr");
    expect(first).toEqual({
      serieId: "sm",
      serieName: "Soleil et Lune",
    });
    expect(httpGet.mock.calls[0]?.[0]).toContain("/fr/sets/sm9");

    const second = await tcgdexSetSerie("sm9", "fr");
    expect(second.serieName).toBe("Soleil et Lune");
    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it("returns empty names when the set lookup fails", async () => {
    httpGet.mockRejectedValueOnce(new Error("down"));
    await expect(tcgdexSetSerie("sm9", "fr")).resolves.toEqual({
      serieId: null,
      serieName: null,
    });
  });
});
