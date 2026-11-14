import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync, rmSync, utimesSync } from "node:fs";
import path from "node:path";
import os from "node:os";

import { launchBoxCatalogStatus } from "./pipeline";

describe("launchbox catalog pipeline", () => {
  const originalIndex = process.env.LAUNCHBOX_INDEX_PATH;
  const originalCache = process.env.LAUNCHBOX_CACHE_DIR;
  const originalMaxAge = process.env.PLACARR_CATALOG_SYNC_MAX_AGE_MS;
  let tmp: string;

  afterEach(() => {
    if (originalIndex === undefined) delete process.env.LAUNCHBOX_INDEX_PATH;
    else process.env.LAUNCHBOX_INDEX_PATH = originalIndex;
    if (originalCache === undefined) delete process.env.LAUNCHBOX_CACHE_DIR;
    else process.env.LAUNCHBOX_CACHE_DIR = originalCache;
    if (originalMaxAge === undefined) {
      delete process.env.PLACARR_CATALOG_SYNC_MAX_AGE_MS;
    } else {
      process.env.PLACARR_CATALOG_SYNC_MAX_AGE_MS = originalMaxAge;
    }
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  it("marks existing index stale after catalog max age", () => {
    tmp = path.join(os.tmpdir(), `placarr-lb-status-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    const index = path.join(tmp, "launchbox.sqlite");
    writeFileSync(index, "sqlite-placeholder");
    const old = new Date(Date.now() - 60_000);
    utimesSync(index, old, old);
    process.env.LAUNCHBOX_INDEX_PATH = index;
    process.env.LAUNCHBOX_CACHE_DIR = tmp;
    process.env.PLACARR_CATALOG_SYNC_MAX_AGE_MS = "1000";

    const status = launchBoxCatalogStatus();
    expect(status.empty).toBe(false);
    expect(status.stale).toBe(true);
    expect(status.lastSyncAt).toBeTruthy();
  });
});
