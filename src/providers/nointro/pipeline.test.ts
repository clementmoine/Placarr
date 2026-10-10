import { afterEach, describe, expect, it } from "vitest";

import { noIntroCatalogStatus, refreshNoIntroCatalog } from "./pipeline";

describe("nointro catalog pipeline", () => {
  const originalDat = process.env.NOINTRO_DAT_PATH;
  const originalPack = process.env.NOINTRO_DAT_PACK;
  const originalUrl = process.env.NOINTRO_DAT_PACK_URL;
  const originalIndex = process.env.NOINTRO_INDEX_PATH;
  const originalCache = process.env.NOINTRO_CACHE_DIR;

  afterEach(() => {
    if (originalDat === undefined) delete process.env.NOINTRO_DAT_PATH;
    else process.env.NOINTRO_DAT_PATH = originalDat;
    if (originalPack === undefined) delete process.env.NOINTRO_DAT_PACK;
    else process.env.NOINTRO_DAT_PACK = originalPack;
    if (originalUrl === undefined) delete process.env.NOINTRO_DAT_PACK_URL;
    else process.env.NOINTRO_DAT_PACK_URL = originalUrl;
    if (originalIndex === undefined) delete process.env.NOINTRO_INDEX_PATH;
    else process.env.NOINTRO_INDEX_PATH = originalIndex;
    if (originalCache === undefined) delete process.env.NOINTRO_CACHE_DIR;
    else process.env.NOINTRO_CACHE_DIR = originalCache;
  });

  it("does not mark empty index stale when no DAT source is configured", () => {
    delete process.env.NOINTRO_DAT_PATH;
    delete process.env.NOINTRO_DAT_PACK;
    delete process.env.NOINTRO_DAT_PACK_URL;
    process.env.NOINTRO_CACHE_DIR = "/tmp/placarr-nointro-pipeline-empty";
    process.env.NOINTRO_INDEX_PATH =
      "/tmp/placarr-nointro-pipeline-empty/missing.sqlite";

    const status = noIntroCatalogStatus();
    expect(status.empty).toBe(true);
    expect(status.stale).toBe(false);
  });

  it("auto refresh no-ops instead of throwing when unconfigured", async () => {
    delete process.env.NOINTRO_DAT_PATH;
    delete process.env.NOINTRO_DAT_PACK;
    delete process.env.NOINTRO_DAT_PACK_URL;
    process.env.NOINTRO_CACHE_DIR = "/tmp/placarr-nointro-pipeline-auto";

    await expect(
      refreshNoIntroCatalog({ auto: true }),
    ).resolves.toBeUndefined();
  });

  it("manual refresh still throws when unconfigured", async () => {
    delete process.env.NOINTRO_DAT_PATH;
    delete process.env.NOINTRO_DAT_PACK;
    delete process.env.NOINTRO_DAT_PACK_URL;
    process.env.NOINTRO_CACHE_DIR = "/tmp/placarr-nointro-pipeline-manual";

    await expect(refreshNoIntroCatalog()).rejects.toThrow(
      /No-Intro index build failed/,
    );
  });
});
