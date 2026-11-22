import { afterEach, describe, expect, it, vi } from "vitest";

import { lorcanaFoilMetaGeneration } from "@/effects/lorcana/foilMetaInvalidate";

import {
  type FoilMetaFileReader,
  hydrateFoilMetaFromAssets,
  installFoilMetaFileReader,
  readDataJsonSync,
  resetFoilMetaCache,
} from "./foilMetaLoad";

describe("readDataJsonSync", () => {
  const g = globalThis as { __PLACARR_FOIL_META_READER__?: FoilMetaFileReader };
  const original = g.__PLACARR_FOIL_META_READER__;

  afterEach(() => {
    if (original) installFoilMetaFileReader(original);
    resetFoilMetaCache();
  });

  it("does not cache the fallback of a missing or half-written file", () => {
    // Sync rewrites manifest.json while the server reads it: the first read
    // fails, the next one must see the file instead of a sticky `{}`.
    let onDisk: Record<string, unknown> | null = null;
    installFoilMetaFileReader(<T>(_key: string, fallback: T): T =>
      onDisk ? (onDisk as T) : fallback,
    );

    expect(readDataJsonSync("lorcana/foil/manifest.json", {})).toEqual({});
    onDisk = { CardFoilSilver: {} };
    expect(readDataJsonSync("lorcana/foil/manifest.json", {})).toEqual({
      CardFoilSilver: {},
    });
  });

  it("keeps caching a successful read", () => {
    let reads = 0;
    installFoilMetaFileReader(<T>(): T => {
      reads += 1;
      return { ok: true } as T;
    });

    readDataJsonSync("lorcana/foil/manifest.json", {});
    readDataJsonSync("lorcana/foil/manifest.json", {});
    expect(reads).toBe(1);
  });
});

describe("hydrateFoilMetaFromAssets", () => {
  afterEach(() => {
    resetFoilMetaCache();
    vi.unstubAllGlobals();
  });

  it("dedupes concurrent browser hydrates onto one pokemon+lorcana pair", async () => {
    vi.stubGlobal("window", {});
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
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
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
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

  it("invalidates Lorcana derived meta after each hydrate", async () => {
    vi.stubGlobal("window", {});
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes("/api/admin/foil-meta")) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return new Response("missing", { status: 404 });
    });

    const before = lorcanaFoilMetaGeneration();
    await hydrateFoilMetaFromAssets(fetchImpl);
    expect(lorcanaFoilMetaGeneration()).toBe(before + 1);

    await hydrateFoilMetaFromAssets(fetchImpl);
    expect(lorcanaFoilMetaGeneration()).toBe(before + 2);
  });
});
