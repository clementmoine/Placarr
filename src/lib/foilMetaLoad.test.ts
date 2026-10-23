import { afterEach, describe, expect, it, vi } from "vitest";

import {
  hydrateFoilMetaFromAssets,
  resetFoilMetaCache,
} from "./foilMetaLoad";

describe("hydrateFoilMetaFromAssets", () => {
  afterEach(() => {
    resetFoilMetaCache();
    vi.unstubAllGlobals();
  });

  it("dedupes concurrent browser hydrates onto one pokemon+lorcana pair", async () => {
    vi.stubGlobal("window", {});
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("/api/admin/foil-meta")) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return new Response("missing", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchImpl);

    await Promise.all([
      hydrateFoilMetaFromAssets(),
      hydrateFoilMetaFromAssets(),
      hydrateFoilMetaFromAssets(),
    ]);

    const adminCalls = fetchImpl.mock.calls.filter((c) =>
      String(c[0]).includes("/api/admin/foil-meta"),
    );
    expect(adminCalls.map((c) => String(c[0])).sort()).toEqual([
      "/api/admin/foil-meta?pack=lorcana",
      "/api/admin/foil-meta?pack=pokemon",
    ]);
  });

  it("re-fetches after resetFoilMetaCache", async () => {
    vi.stubGlobal("window", {});
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("/api/admin/foil-meta")) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return new Response("missing", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchImpl);

    await hydrateFoilMetaFromAssets();
    resetFoilMetaCache();
    await hydrateFoilMetaFromAssets();

    const adminCalls = fetchImpl.mock.calls.filter((c) =>
      String(c[0]).includes("/api/admin/foil-meta"),
    );
    expect(adminCalls).toHaveLength(4);
  });
});
