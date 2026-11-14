import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  enqueueBackgroundWorkJob: vi.fn().mockResolvedValue({ id: "job-1" }),
  ensureICollectIndex: vi.fn(async () => null),
  httpGet: vi.fn(),
  ingestICollectSitemapXml: vi.fn(async () => ({
    barcodeUpserts: 1,
    catalogUpserts: 1,
  })),
  meta: new Map<string, string>(),
}));

vi.mock("@/core/collect/jobs/workQueue", () => ({
  BACKGROUND_WORK_KIND: {
    metadataRefresh: "metadataRefresh",
    priceRefresh: "priceRefresh",
    icollectCatalogSync: "icollectCatalogSync",
    catalogProviderSync: "catalogProviderSync",
  },
  enqueueBackgroundWorkJob: h.enqueueBackgroundWorkJob,
}));

vi.mock("@/lib/http/httpClient", () => ({
  httpGet: h.httpGet,
}));

vi.mock("./indexStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./indexStore")>();
  return {
    ...actual,
    ensureICollectIndex: h.ensureICollectIndex,
    ingestICollectSitemapXml: h.ingestICollectSitemapXml,
    readICollectIndexMeta: (db: unknown, key: string) =>
      h.meta.get(key) ?? actual.readICollectIndexMeta(db as never, key),
    writeICollectIndexMeta: (_db: unknown, key: string, value: string) => {
      h.meta.set(key, value);
    },
  };
});

import {
  ingestICollectSitemapByUrl,
  isICollectCatalogSyncEnabled,
  maybeScheduleICollectCatalogSync,
  resetICollectCatalogSyncForTests,
  runICollectFullSitemapSync,
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
        kind: "catalogProviderSync",
        replaceOpenForKind: true,
        replaceOpenPayloadMatch: {
          path: ["providerId"],
          equals: "icollect",
        },
        payload: expect.objectContaining({
          providerId: "icollect",
          auto: true,
        }),
      }),
    );
    expect(h.ensureICollectIndex).not.toHaveBeenCalled();
  });
});

describe("iCollect sitemap HTTP resilience", () => {
  beforeEach(() => {
    h.httpGet.mockReset();
    h.ingestICollectSitemapXml.mockClear();
    h.meta.clear();
  });

  it("retries EPIPE on a single sitemap GET then succeeds", async () => {
    const epipe = new axios.AxiosError("write EPIPE", "EPIPE");
    h.httpGet
      .mockRejectedValueOnce(epipe)
      .mockResolvedValueOnce({
        status: 200,
        data: `<?xml version="1.0"?><urlset></urlset>`,
      });

    const stats = await ingestICollectSitemapByUrl(
      {} as never,
      "https://www.icollecteverything.com/sitemaps/sitemap-videogames11.xml",
    );
    expect(stats).toEqual({ barcodeUpserts: 1, catalogUpserts: 1 });
    expect(h.httpGet).toHaveBeenCalledTimes(2);
    expect(h.ingestICollectSitemapXml).toHaveBeenCalledTimes(1);
  });

  it("continues the full pass when one sitemap stays down", async () => {
    const epipe = new axios.AxiosError("write EPIPE", "EPIPE");
    h.httpGet.mockImplementation(async (url: string) => {
      if (url.includes("sitemap-master")) {
        return {
          status: 200,
          data: `<?xml version="1.0"?><sitemapindex>
  <sitemap><loc>https://www.icollecteverything.com/sitemaps/sitemap-videogames1.xml</loc></sitemap>
  <sitemap><loc>https://www.icollecteverything.com/sitemaps/sitemap-videogames11.xml</loc></sitemap>
</sitemapindex>`,
        };
      }
      if (url.includes("videogames11")) throw epipe;
      return {
        status: 200,
        data: `<?xml version="1.0"?><urlset></urlset>`,
      };
    });

    const errors: string[] = [];
    const result = await runICollectFullSitemapSync({} as never, {
      onSitemapError: ({ url }) => errors.push(url),
    });
    expect(result.sitemaps).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.barcodeUpserts).toBe(1);
    expect(errors.some((u) => u.includes("videogames11"))).toBe(true);
    // Exhausted retries on the bad shard (4) + one success + one master fetch.
    expect(h.httpGet.mock.calls.length).toBeGreaterThanOrEqual(6);
  });
});
