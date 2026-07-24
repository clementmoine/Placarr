import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  enqueueBackgroundWorkJob: vi.fn().mockResolvedValue({ id: "job-1" }),
  ensureICollectIndex: vi.fn(async () => null),
}));

vi.mock("@/core/collect/jobs/workQueue", () => ({
  BACKGROUND_WORK_KIND: {
    metadataRefresh: "metadataRefresh",
    priceRefresh: "priceRefresh",
    icollectCatalogSync: "icollectCatalogSync",
  },
  enqueueBackgroundWorkJob: h.enqueueBackgroundWorkJob,
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
    h.enqueueBackgroundWorkJob.mockClear();
    h.ensureICollectIndex.mockClear();
    resetICollectCatalogSyncForTests();
    delete process.env.VITEST;
    delete process.env.ICOLLECT_CATALOG_SYNC;
  });

  afterEach(() => {
    resetICollectCatalogSyncForTests();
    process.env.VITEST = "true";
  });

  it("enqueues a single worker tick", async () => {
    maybeScheduleICollectCatalogSync();
    maybeScheduleICollectCatalogSync();
    await vi.waitFor(() => {
      expect(h.enqueueBackgroundWorkJob).toHaveBeenCalledTimes(1);
    });
    expect(h.enqueueBackgroundWorkJob).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "icollectCatalogSync",
        replaceOpenForKind: true,
      }),
    );
    expect(h.ensureICollectIndex).not.toHaveBeenCalled();
  });
});
