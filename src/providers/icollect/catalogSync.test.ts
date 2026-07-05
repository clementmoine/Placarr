import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  runBackgroundWork: vi.fn((fn: () => Promise<unknown>) => fn()),
  ensureICollectIndex: vi.fn(async () => null),
}));

vi.mock("@/core/jobs/backgroundWorkQueue", () => ({
  runBackgroundWork: h.runBackgroundWork,
}));

vi.mock("./indexStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./indexStore")>();
  return {
    ...actual,
    ensureICollectIndex: h.ensureICollectIndex,
  };
});

import {
  isICollectCatalogSyncEnabled,
  maybeScheduleICollectCatalogSync,
  resetICollectCatalogSyncForTests,
} from "./catalogSync";

describe("isICollectCatalogSyncEnabled", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it("is disabled under vitest and when opted out", () => {
    process.env.VITEST = "true";
    expect(isICollectCatalogSyncEnabled()).toBe(false);
    delete process.env.VITEST;
    expect(isICollectCatalogSyncEnabled()).toBe(true);
    process.env.ICOLLECT_CATALOG_SYNC = "0";
    expect(isICollectCatalogSyncEnabled()).toBe(false);
  });
});

describe("maybeScheduleICollectCatalogSync", () => {
  beforeEach(() => {
    h.runBackgroundWork.mockClear();
    h.ensureICollectIndex.mockClear();
    resetICollectCatalogSyncForTests();
    delete process.env.VITEST;
    delete process.env.ICOLLECT_CATALOG_SYNC;
  });

  afterEach(() => {
    resetICollectCatalogSyncForTests();
    process.env.VITEST = "true";
  });

  it("queues a single background tick", async () => {
    maybeScheduleICollectCatalogSync();
    maybeScheduleICollectCatalogSync();
    expect(h.runBackgroundWork).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(h.ensureICollectIndex).toHaveBeenCalled();
  });
});
