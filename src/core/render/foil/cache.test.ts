import { afterEach, describe, expect, it, vi } from "vitest";

import {
  __foilCacheStats,
  __resetFoilCachesForTests,
  fetchArrayBuffer,
  fetchFragmentSource,
  fetchImageBitmap,
} from "./cache";

describe("foil cache", () => {
  afterEach(() => {
    __resetFoilCachesForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fetches a fragment once per URL", async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      text: async () => `shader:${url}`,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const url = "https://example.test/shader.frag";
    const [a, b] = await Promise.all([
      fetchFragmentSource(url),
      fetchFragmentSource(url),
    ]);

    expect(a).toBe("shader:https://example.test/shader.frag");
    expect(b).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(__foilCacheStats().fragmentFetches).toBe(1);
  });

  it("fetches an image bitmap once per URL with flipY and no color conversion", async () => {
    const bitmap = { width: 1, height: 1 } as ImageBitmap;
    const createImageBitmap = vi.fn(async () => bitmap);
    vi.stubGlobal("createImageBitmap", createImageBitmap);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        blob: async () => new Blob(["x"]),
      })),
    );

    const url = "https://example.test/tex.png";
    const [a, b] = await Promise.all([
      fetchImageBitmap(url),
      fetchImageBitmap(url),
    ]);

    expect(a).toBe(bitmap);
    expect(b).toBe(a);
    expect(createImageBitmap).toHaveBeenCalledWith(expect.any(Blob), {
      imageOrientation: "flipY",
      colorSpaceConversion: "none",
    });
    expect(__foilCacheStats().imageFetches).toBe(1);
  });

  it("fetches an array buffer once per URL", async () => {
    const buffer = new ArrayBuffer(8);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => buffer,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const url = "https://example.test/tex.astc";
    const [a, b] = await Promise.all([
      fetchArrayBuffer(url),
      fetchArrayBuffer(url),
    ]);

    expect(a).toBe(buffer);
    expect(b).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(__foilCacheStats().bufferFetches).toBe(1);
  });

  it("propagates fetch failures without incrementing counters on cache hits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404 })),
    );

    const url = "https://example.test/missing.frag";
    await expect(fetchFragmentSource(url)).rejects.toThrow("shader");
    await expect(fetchFragmentSource(url)).rejects.toThrow("shader");
    expect(__foilCacheStats().fragmentFetches).toBe(1);
  });
});
