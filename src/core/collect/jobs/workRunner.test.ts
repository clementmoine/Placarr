import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  isBackgroundWorkJobCancelled: vi.fn().mockResolvedValue(false),
  enqueueBackgroundWorkJob: vi.fn().mockResolvedValue({ id: "price-1" }),
  adoptItemMetadataRefreshOnWorker: vi.fn(),
  finishItemMetadataRefresh: vi.fn().mockResolvedValue(undefined),
  fetchAndStoreMetadata: vi.fn(),
  repairProviderExternalLinksForItem: vi.fn().mockResolvedValue(undefined),
  itemPricesContextFromRecord: vi.fn(),
  itemPricesNeedRefresh: vi.fn().mockResolvedValue(true),
  refreshItemPricesFromContext: vi.fn(),
  prismaItemFindUnique: vi.fn(),
  prismaItemUpdate: vi.fn(),
}));

vi.mock("@/core/collect/jobs/workQueue", () => ({
  BACKGROUND_WORK_KIND: {
    metadataRefresh: "metadataRefresh",
    priceRefresh: "priceRefresh",
    icollectCatalogSync: "icollectCatalogSync",
  },
  enqueueBackgroundWorkJob: h.enqueueBackgroundWorkJob,
  isBackgroundWorkJobCancelled: h.isBackgroundWorkJobCancelled,
}));

vi.mock("@/core/collect/jobs/metadataRefreshSession", () => ({
  adoptItemMetadataRefreshOnWorker: h.adoptItemMetadataRefreshOnWorker,
  finishItemMetadataRefresh: h.finishItemMetadataRefresh,
  isAbortError: (error: unknown) =>
    error instanceof Error && error.name === "AbortError",
}));

vi.mock("@/core/enrich", () => ({
  fetchAndStoreMetadata: h.fetchAndStoreMetadata,
}));

vi.mock("@/core/enrich/platform", () => ({
  resolveGameMetadataPlatform: vi.fn(() => null),
}));

vi.mock("@/core/enrich/persistProviderExternalLinks", () => ({
  repairProviderExternalLinksForItem: h.repairProviderExternalLinksForItem,
}));

vi.mock("@/core/commerce/pricing/itemDisplay", () => ({
  itemPricesContextFromRecord: h.itemPricesContextFromRecord,
  itemPricesNeedRefresh: h.itemPricesNeedRefresh,
  refreshItemPricesFromContext: h.refreshItemPricesFromContext,
}));

vi.mock("@/core/enrich/media/imageMetrics", () => ({
  isCoverResolutionAcceptable: vi.fn(() => true),
  readFileImageMetrics: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    item: {
      findUnique: h.prismaItemFindUnique,
      update: h.prismaItemUpdate,
    },
  },
}));

import { executeMetadataRefreshJob } from "./workRunner";
import type { BackgroundWorkJobRow } from "./workQueue";

describe("executeMetadataRefreshJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.isBackgroundWorkJobCancelled.mockResolvedValue(false);
    h.adoptItemMetadataRefreshOnWorker.mockResolvedValue({
      generation: 1,
      signal: new AbortController().signal,
      controller: new AbortController(),
    });
    h.fetchAndStoreMetadata.mockResolvedValue({ title: "Wakfu" });
    h.prismaItemFindUnique.mockResolvedValue({
      id: "item-1",
      userId: "user-1",
      name: "Wakfu",
      barcode: null,
      metadataId: "meta-1",
      imageUrl: null,
      shelf: { type: "books", name: "Mangas" },
      metadata: { title: "Wakfu", aliases: null, facts: [] },
    });
    h.itemPricesContextFromRecord.mockReturnValue({
      id: "item-1",
      barcode: null,
      name: "Wakfu",
      metadataId: "meta-1",
      metadataTitle: "Wakfu",
      metadataAliases: null,
      metadataFacts: [],
      shelfType: "books",
      shelfName: "Mangas",
    });
    h.itemPricesNeedRefresh.mockResolvedValue(true);
  });

  it("finishes the metadata stamp then enqueues priceRefresh instead of awaiting prices", async () => {
    const order: string[] = [];
    h.finishItemMetadataRefresh.mockImplementation(async () => {
      order.push("finish");
    });
    h.enqueueBackgroundWorkJob.mockImplementation(async () => {
      order.push("enqueue-prices");
      return { id: "price-1" };
    });
    h.repairProviderExternalLinksForItem.mockImplementation(async () => {
      order.push("repair-links");
    });

    await executeMetadataRefreshJob(
      {
        id: "job-1",
        kind: "metadataRefresh",
        status: "running",
        itemId: "item-1",
        userId: "user-1",
        payload: {},
        attempts: 1,
        lockedAt: new Date(),
        lockedBy: "worker",
        runAfter: new Date(),
        error: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        finishedAt: null,
      } as BackgroundWorkJobRow,
      {
        itemId: "item-1",
        lookupQuery: "Wakfu Tome 3",
        shelfType: "books",
        shelfName: "Mangas",
        generation: 1,
        forceRefresh: true,
        bypassMetadataCache: true,
      },
    );

    expect(h.fetchAndStoreMetadata).toHaveBeenCalled();
    expect(h.refreshItemPricesFromContext).not.toHaveBeenCalled();
    expect(h.enqueueBackgroundWorkJob).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "priceRefresh",
        itemId: "item-1",
        replaceOpenForItem: true,
      }),
    );
    expect(order.indexOf("finish")).toBeLessThan(
      order.indexOf("enqueue-prices"),
    );
  });

  it("skips post-metadata price enqueue when the cache is still fresh", async () => {
    h.itemPricesNeedRefresh.mockResolvedValueOnce(false);

    await executeMetadataRefreshJob(
      {
        id: "job-2",
        kind: "metadataRefresh",
        status: "running",
        itemId: "item-1",
        userId: "user-1",
        payload: {},
        attempts: 1,
        lockedAt: new Date(),
        lockedBy: "worker",
        runAfter: new Date(),
        error: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        finishedAt: null,
      } as BackgroundWorkJobRow,
      {
        itemId: "item-1",
        lookupQuery: "Wakfu Tome 3",
        shelfType: "books",
        shelfName: "Mangas",
        generation: 1,
        forceRefresh: true,
        bypassMetadataCache: true,
      },
    );

    expect(h.enqueueBackgroundWorkJob).not.toHaveBeenCalled();
    expect(h.repairProviderExternalLinksForItem).toHaveBeenCalled();
  });

  it("enqueues a soft priceRefresh (force:false) when prices need refresh", async () => {
    h.itemPricesNeedRefresh.mockResolvedValueOnce(true);

    await executeMetadataRefreshJob(
      {
        id: "job-3",
        kind: "metadataRefresh",
        status: "running",
        itemId: "item-1",
        userId: "user-1",
        payload: {},
        attempts: 1,
        lockedAt: new Date(),
        lockedBy: "worker",
        runAfter: new Date(),
        error: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        finishedAt: null,
      } as BackgroundWorkJobRow,
      {
        itemId: "item-1",
        lookupQuery: "Wakfu Tome 3",
        shelfType: "books",
        shelfName: "Mangas",
        generation: 1,
        forceRefresh: true,
        bypassMetadataCache: true,
      },
    );

    expect(h.enqueueBackgroundWorkJob).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "priceRefresh",
        payload: expect.objectContaining({ force: false }),
      }),
    );
  });
});
