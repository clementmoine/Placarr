import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  getCachedPrintCatalogues,
  loadPrintCatalogues,
  prefetchPrintCatalogues,
} from "@/lib/client/printCataloguesCache";

describe("printCataloguesCache", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Fresh module state: re-import would be heavy; clear via load with mock.
  });

  it("returns null when cold", async () => {
    // Isolate by using a unique type key
    expect(getCachedPrintCatalogues("__cold_test_type__")).toBeNull();
  });

  it("caches a successful fetch for sync reads", async () => {
    const type = `__cache_warm_${Math.random().toString(36).slice(2)}`;
    const catalogues = [
      { id: "pokemon", label: "Pokémon", languages: ["fr", "en"] },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ catalogues }),
      })),
    );

    const loaded = await loadPrintCatalogues(type);
    expect(loaded).toEqual(catalogues);
    expect(getCachedPrintCatalogues(type)).toEqual(catalogues);
    expect(fetch).toHaveBeenCalledTimes(1);

    await loadPrintCatalogues(type);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("prefetch warms the cache without throwing", async () => {
    const type = `__cache_prefetch_${Math.random().toString(36).slice(2)}`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          catalogues: [{ id: "x", label: "X" }],
        }),
      })),
    );
    prefetchPrintCatalogues(type);
    await vi.waitFor(() => {
      expect(getCachedPrintCatalogues(type)?.length).toBe(1);
    });
  });
});
