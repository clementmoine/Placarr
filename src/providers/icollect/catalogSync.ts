import { httpGet } from "@/lib/http/httpClient";
import type { DatabaseSync } from "node:sqlite";

import { createSerializeAsync } from "@/lib/async/serializeAsync";
import {
  BACKGROUND_WORK_KIND,
  BACKGROUND_WORK_STATUS,
  enqueueBackgroundWorkJob,
} from "@/core/collect/jobs/workQueue";
import { prisma } from "@/lib/db/prisma";

import {
  fetchICollectVideoGameItem,
  ICE_HEADERS,
  parseVideoGameSitemapUrls,
} from "./fetch";
import {
  classifyICollectFetchError,
  PAGE_SCRAPE_PACE,
  PageScrapePace,
  readICollectRetryAfterMs,
} from "./pageScrapePace";
import {
  countICollectBarcodeIndex,
  ensureICollectIndex,
  ingestICollectSitemapXml,
  listDistinctICollectItems,
  readICollectIndexMeta,
  shouldRefreshICollectItemPage,
  writeICollectIndexMeta,
  DEFAULT_PAGE_CATALOG_REFRESH_MS,
  type ICollectIngestStats,
} from "./indexStore";

const ICE_SITEMAP_MASTER =
  "https://www.icollecteverything.com/sitemaps/sitemap-master.xml";

const META_SITEMAP_CURSOR = "sync_sitemap_cursor";
const META_SITEMAP_TOTAL = "sync_sitemap_total";
const META_SITEMAP_PASS_COMPLETED_AT = "sync_last_sitemap_pass_completed_at";
const META_PAGE_CURSOR = "sync_page_cursor";
const META_LAST_PAGE_BATCH_AT = "sync_last_page_batch_at";
const META_PAGE_REFRESH_PASS_COMPLETED_AT =
  "sync_last_page_refresh_pass_completed_at";

const META_PAGE_BACKOFF_UNTIL = "sync_page_backoff_until";

const DEFAULT_SITEMAP_PASS_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_PAGE_BATCH_INTERVAL_MS = 0;
const DEFAULT_SYNC_CHECK_MS = 5 * 60 * 1000;
/** 0 = no per-tick cap — run until rate limit or tick budget. */
const DEFAULT_PAGE_SCRAPE_BATCH = 0;
const DEFAULT_PAGE_SCRAPE_DELAY_MS = 0;
const DEFAULT_PAGE_SCRAPE_CONCURRENCY = 1;
/** Min spacing between HTTP starts when concurrency > 1 (avoids instant bursts). */
const DEFAULT_PARALLEL_START_GAP_MS = 250;
const DEFAULT_PAGE_SCRAPE_TICK_BUDGET_MS = 2 * 60 * 1000;

const globalStateKey = "__placarr_icollect_catalog_sync";

type GlobalSyncState = {
  loopStarted?: boolean;
  syncScheduled?: boolean;
  syncRunning?: boolean;
};

function globalSyncState(): GlobalSyncState {
  const root = globalThis as typeof globalThis &
    Record<string, GlobalSyncState>;
  if (!root[globalStateKey]) root[globalStateKey] = {};
  return root[globalStateKey];
}

function readPositiveInt(envName: string, fallback: number, min = 1): number {
  const raw = Number.parseInt(process.env[envName] || "", 10);
  if (!Number.isFinite(raw) || raw < min) return fallback;
  return raw;
}

function readNonNegativeInt(envName: string, fallback: number): number {
  const raw = Number.parseInt(process.env[envName] || "", 10);
  if (!Number.isFinite(raw) || raw < 0) return fallback;
  return raw;
}

function readBatchSize(envName: string, fallback: number): number {
  const raw = Number.parseInt(process.env[envName] || "", 10);
  if (!Number.isFinite(raw) || raw < 0) return fallback;
  return raw;
}

function readPageBackoffUntil(db: DatabaseSync): number {
  return readMetaInt(db, META_PAGE_BACKOFF_UNTIL, 0);
}

function writePageBackoffUntil(db: DatabaseSync, untilMs: number): void {
  if (untilMs <= 0) {
    writeICollectIndexMeta(db, META_PAGE_BACKOFF_UNTIL, "");
    return;
  }
  writeMetaInt(db, META_PAGE_BACKOFF_UNTIL, untilMs);
}

export function isICollectCatalogSyncEnabled(): boolean {
  if (process.env.ICOLLECT_CATALOG_SYNC === "0") return false;
  if (process.env.RECORD || process.env.BARCODE_RECORD_SLIM === "1")
    return false;
  if (process.env.VITEST) return false;
  return true;
}

function readMetaInt(db: DatabaseSync, key: string, fallback = 0): number {
  const raw = readICollectIndexMeta(db, key);
  const value = Number.parseInt(raw || "", 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function writeMetaInt(db: DatabaseSync, key: string, value: number): void {
  writeICollectIndexMeta(db, key, String(value));
}

export async function fetchICollectVideoGameSitemapUrls(): Promise<string[]> {
  const response = await httpGet<string>(ICE_SITEMAP_MASTER, {
    headers: ICE_HEADERS,
    timeout: 20_000,
    validateStatus: (status) => status >= 200 && status < 400,
  });
  return parseVideoGameSitemapUrls(response.data);
}

export async function ingestICollectSitemapByUrl(
  db: DatabaseSync,
  sitemapUrl: string,
): Promise<ICollectIngestStats> {
  const response = await httpGet<string>(sitemapUrl, {
    headers: ICE_HEADERS,
    timeout: 120_000,
    validateStatus: (status) => status >= 200 && status < 400,
  });
  return ingestICollectSitemapXml(db, response.data);
}

export async function runICollectFullSitemapSync(
  db: DatabaseSync,
  options: {
    onProgress?: (info: {
      index: number;
      total: number;
      url: string;
      stats: ICollectIngestStats;
    }) => void;
  } = {},
): Promise<{
  sitemaps: number;
  barcodeUpserts: number;
  catalogUpserts: number;
}> {
  const sitemapUrls = await fetchICollectVideoGameSitemapUrls();
  writeMetaInt(db, META_SITEMAP_TOTAL, sitemapUrls.length);
  writeMetaInt(db, META_SITEMAP_CURSOR, 0);

  let barcodeUpserts = 0;
  let catalogUpserts = 0;
  for (const [index, sitemapUrl] of sitemapUrls.entries()) {
    const stats = await ingestICollectSitemapByUrl(db, sitemapUrl);
    barcodeUpserts += stats.barcodeUpserts;
    catalogUpserts += stats.catalogUpserts;
    options.onProgress?.({
      index: index + 1,
      total: sitemapUrls.length,
      url: sitemapUrl,
      stats,
    });
  }

  writeMetaInt(db, META_SITEMAP_CURSOR, 0);
  writeICollectIndexMeta(
    db,
    META_SITEMAP_PASS_COMPLETED_AT,
    String(Date.now()),
  );

  return {
    sitemaps: sitemapUrls.length,
    barcodeUpserts,
    catalogUpserts,
  };
}

async function ensureSitemapUrlList(db: DatabaseSync): Promise<string[]> {
  const total = readMetaInt(db, META_SITEMAP_TOTAL, 0);
  if (total <= 0) {
    const urls = await fetchICollectVideoGameSitemapUrls();
    writeMetaInt(db, META_SITEMAP_TOTAL, urls.length);
    return urls;
  }

  const urls = await fetchICollectVideoGameSitemapUrls();
  if (urls.length !== total) {
    writeMetaInt(db, META_SITEMAP_TOTAL, urls.length);
    const cursor = readMetaInt(db, META_SITEMAP_CURSOR, 0);
    if (cursor >= urls.length) writeMetaInt(db, META_SITEMAP_CURSOR, 0);
  }
  return urls;
}

export async function runICollectSitemapSyncStep(
  db: DatabaseSync,
): Promise<ICollectIngestStats | null> {
  const passIntervalMs = readPositiveInt(
    "ICOLLECT_SITEMAP_PASS_INTERVAL_MS",
    DEFAULT_SITEMAP_PASS_INTERVAL_MS,
  );
  const lastCompleted = readMetaInt(db, META_SITEMAP_PASS_COMPLETED_AT, 0);
  const cursor = readMetaInt(db, META_SITEMAP_CURSOR, 0);
  const barcodeCount = countICollectBarcodeIndex(db);
  const passDue =
    barcodeCount === 0 ||
    !lastCompleted ||
    Date.now() - lastCompleted >= passIntervalMs;

  if (!passDue && cursor === 0) return null;

  const sitemapUrls = await ensureSitemapUrlList(db);
  if (sitemapUrls.length === 0) return null;

  if (cursor >= sitemapUrls.length) {
    writeMetaInt(db, META_SITEMAP_CURSOR, 0);
    writeICollectIndexMeta(
      db,
      META_SITEMAP_PASS_COMPLETED_AT,
      String(Date.now()),
    );
    return null;
  }

  const stats = await ingestICollectSitemapByUrl(db, sitemapUrls[cursor]!);
  const nextCursor = cursor + 1;
  writeMetaInt(db, META_SITEMAP_CURSOR, nextCursor);
  if (nextCursor >= sitemapUrls.length) {
    writeMetaInt(db, META_SITEMAP_CURSOR, 0);
    writeICollectIndexMeta(
      db,
      META_SITEMAP_PASS_COMPLETED_AT,
      String(Date.now()),
    );
  }

  console.log(
    `[iCollect sync] sitemap ${nextCursor}/${sitemapUrls.length} +${stats.barcodeUpserts} barcodes, +${stats.catalogUpserts} catalog rows`,
  );
  return stats;
}

export async function runICollectPageScrapeBatch(
  db: DatabaseSync,
  options: {
    batchSize?: number;
    delayMs?: number;
    concurrency?: number;
    startGapMs?: number;
    force?: boolean;
    refreshMaxAgeMs?: number;
    tickBudgetMs?: number;
  } = {},
): Promise<{
  scraped: number;
  failed: number;
  skipped: number;
  rateLimited: boolean;
  backoffMs: number;
  passCompleted: boolean;
}> {
  const batchSize =
    options.batchSize ??
    readBatchSize("ICOLLECT_PAGE_SCRAPE_BATCH", DEFAULT_PAGE_SCRAPE_BATCH);
  const items = listDistinctICollectItems(db);
  if (items.length === 0) {
    return {
      scraped: 0,
      failed: 0,
      skipped: 0,
      rateLimited: false,
      backoffMs: 0,
      passCompleted: false,
    };
  }

  const baseDelayMs =
    options.delayMs ??
    readNonNegativeInt(
      "ICOLLECT_PAGE_SCRAPE_DELAY_MS",
      DEFAULT_PAGE_SCRAPE_DELAY_MS,
    );
  const concurrency =
    options.concurrency ??
    readPositiveInt(
      "ICOLLECT_PAGE_SCRAPE_CONCURRENCY",
      DEFAULT_PAGE_SCRAPE_CONCURRENCY,
    );
  const requestStartGapMs =
    options.startGapMs ??
    readNonNegativeInt(
      "ICOLLECT_PAGE_SCRAPE_START_GAP_MS",
      concurrency > 1
        ? Math.max(baseDelayMs, DEFAULT_PARALLEL_START_GAP_MS)
        : baseDelayMs,
    );
  const tickBudgetMs =
    options.tickBudgetMs ??
    readPositiveInt(
      "ICOLLECT_PAGE_SCRAPE_TICK_BUDGET_MS",
      DEFAULT_PAGE_SCRAPE_TICK_BUDGET_MS,
    );
  const refreshMaxAgeMs =
    options.refreshMaxAgeMs ??
    readPositiveInt(
      "ICOLLECT_PAGE_CATALOG_REFRESH_MS",
      DEFAULT_PAGE_CATALOG_REFRESH_MS,
    );

  const backoffUntil = readPageBackoffUntil(db);
  if (backoffUntil > Date.now()) {
    return {
      scraped: 0,
      failed: 0,
      skipped: 0,
      rateLimited: true,
      backoffMs: backoffUntil - Date.now(),
      passCompleted: false,
    };
  }
  writePageBackoffUntil(db, 0);

  let cursor = readMetaInt(db, META_PAGE_CURSOR, 0);
  if (cursor >= items.length) cursor = 0;

  const pace = new PageScrapePace(
    { ...PAGE_SCRAPE_PACE, baseDelayMs, minDelayMs: baseDelayMs },
    baseDelayMs,
  );
  const paceGate = createSerializeAsync();
  const coordGate = createSerializeAsync();
  const startGate = createSerializeAsync();
  let nextRequestStartAt = 0;

  const waitForRequestStartSlot = () =>
    startGate.run(async () => {
      if (requestStartGapMs <= 0) return;
      const now = Date.now();
      const waitMs = Math.max(0, nextRequestStartAt - now);
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      nextRequestStartAt = Date.now() + requestStartGapMs;
    });

  let fetchTimeoutMs = readPositiveInt(
    "ICOLLECT_PAGE_FETCH_TIMEOUT_MS",
    20_000,
  );
  const fetchTimeoutMaxMs = readPositiveInt(
    "ICOLLECT_PAGE_FETCH_TIMEOUT_MAX_MS",
    120_000,
  );

  let scraped = 0;
  let failed = 0;
  let skipped = 0;
  let attempts = 0;
  let rateLimited = false;
  let backoffMs = 0;
  const deadline = Date.now() + tickBudgetMs;
  const maxAttempts =
    batchSize <= 0
      ? Number.MAX_SAFE_INTEGER
      : Math.max(batchSize * 4, items.length);
  const batchLabel =
    batchSize <= 0
      ? `unlimited (≤${Math.round(tickBudgetMs / 60_000)}min)`
      : String(batchSize);
  let lastHeartbeatAt = Date.now();
  let lastMetadataYieldCheckAt = 0;
  let yieldForMetadata = false;
  let scrapeBudgetRemaining =
    batchSize <= 0 ? Number.MAX_SAFE_INTEGER : batchSize;

  console.log(
    `[iCollect scrape] batch start size=${batchLabel} items=${items.length} cursor=${cursor} delay=${baseDelayMs}ms concurrency=${concurrency}${requestStartGapMs > 0 ? ` startGap=${requestStartGapMs}ms` : ""}`,
  );

  const refreshMetadataYieldFlag = async () => {
    if (Date.now() - lastMetadataYieldCheckAt < 5_000) return;
    lastMetadataYieldCheckAt = Date.now();
    const waiting = await prisma.backgroundWorkJob.count({
      where: {
        status: BACKGROUND_WORK_STATUS.pending,
        kind: BACKGROUND_WORK_KIND.metadataRefresh,
        runAfter: { lte: new Date() },
      },
    });
    if (waiting > 0 && !yieldForMetadata) {
      console.log(
        `[iCollect scrape] yielding — ${waiting} metadataRefresh job(s) waiting`,
      );
    }
    yieldForMetadata = waiting > 0;
  };

  const shouldStopBatch = () =>
    Date.now() >= deadline ||
    attempts >= maxAttempts ||
    rateLimited ||
    yieldForMetadata;

  const logSkipHeartbeat = () => {
    if (
      skipped === 1 ||
      (skipped > 0 && skipped % 500 === 0) ||
      Date.now() - lastHeartbeatAt >= 30_000
    ) {
      console.log(
        `[iCollect scrape] scanning… skipped=${skipped} scraped=${scraped} failed=${failed} cursor=${cursor}/${items.length}`,
      );
      lastHeartbeatAt = Date.now();
    }
  };

  const claimNextScrapeItem = () =>
    coordGate.run(async () => {
      await refreshMetadataYieldFlag();
      while (!shouldStopBatch()) {
        if (cursor >= items.length) return null;

        const item = items[cursor];
        cursor += 1;
        attempts += 1;
        if (!item) continue;

        const needsRefresh = shouldRefreshICollectItemPage(db, item.itemId, {
          force: options.force,
          maxAgeMs: refreshMaxAgeMs,
        });
        if (!needsRefresh) {
          skipped += 1;
          logSkipHeartbeat();
          continue;
        }

        if (scrapeBudgetRemaining <= 0) return null;
        scrapeBudgetRemaining -= 1;

        return { item, cursorSnapshot: cursor };
      }
      return null;
    });

  const scrapeOne = async (work: {
    item: (typeof items)[number];
    cursorSnapshot: number;
  }): Promise<void> => {
    const { item, cursorSnapshot } = work;
    await paceGate.run(async () => {
      if (rateLimited) return;
      await pace.wait();
    });
    if (rateLimited) return;
    await waitForRequestStartSlot();

    const started = Date.now();
    try {
      const metadata = await fetchICollectVideoGameItem(item.itemUrl, {
        bypassCache: true,
        timeoutMs: fetchTimeoutMs,
      });
      if (metadata) {
        await paceGate.run(async () => {
          pace.onSuccess();
        });
        scraped += 1;
        console.log(
          `[iCollect scrape] +${scraped} ${metadata.title} (${Date.now() - started}ms) cursor=${cursorSnapshot}/${items.length}`,
        );
        if (scraped % 25 === 0) {
          writeMetaInt(db, META_PAGE_CURSOR, cursorSnapshot);
        }
        lastHeartbeatAt = Date.now();
        return;
      }

      failed += 1;
      console.warn(
        `[iCollect scrape] miss item=${item.itemId} (${Date.now() - started}ms)`,
      );
    } catch (error) {
      const kind = classifyICollectFetchError(error);
      if (kind === "rate_limited") {
        await paceGate.run(async () => {
          if (rateLimited) return;
          backoffMs = pace.onRateLimited(readICollectRetryAfterMs(error));
          writePageBackoffUntil(db, Date.now() + backoffMs);
          rateLimited = true;
          console.warn(
            `[iCollect sync] rate limited — backing off ${Math.ceil(backoffMs / 1000)}s`,
          );
        });
        return;
      }

      if (kind === "transient") {
        await coordGate.run(async () => {
          pace.onTransientError();
          fetchTimeoutMs = Math.min(fetchTimeoutMaxMs, fetchTimeoutMs + 5_000);
          failed += 1;
        });
        return;
      }

      failed += 1;
    }
  };

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (!shouldStopBatch()) {
        const work = await claimNextScrapeItem();
        if (!work) break;
        await scrapeOne(work);
      }
    }),
  );

  const wrapped = cursor >= items.length;
  writeMetaInt(db, META_PAGE_CURSOR, wrapped ? 0 : cursor);
  if (wrapped) {
    writeICollectIndexMeta(
      db,
      META_PAGE_REFRESH_PASS_COMPLETED_AT,
      String(Date.now()),
    );
  }
  writeICollectIndexMeta(db, META_LAST_PAGE_BATCH_AT, String(Date.now()));

  if (scraped > 0 || failed > 0 || rateLimited) {
    console.log(
      `[iCollect sync] page batch scraped=${scraped} failed=${failed} skipped=${skipped} rateLimited=${rateLimited} cursor=${wrapped ? items.length : cursor}/${items.length}`,
    );
  }

  return {
    scraped,
    failed,
    skipped,
    rateLimited,
    backoffMs,
    passCompleted: wrapped,
  };
}

export async function runICollectCatalogSyncTick(): Promise<void> {
  if (!isICollectCatalogSyncEnabled()) return;

  const db = await ensureICollectIndex();
  if (!db) return;

  const sitemapStats = await runICollectSitemapSyncStep(db);
  if (sitemapStats) return;

  const pageIntervalMs = readPositiveInt(
    "ICOLLECT_PAGE_BATCH_INTERVAL_MS",
    DEFAULT_PAGE_BATCH_INTERVAL_MS,
  );
  const lastPageBatch = readMetaInt(db, META_LAST_PAGE_BATCH_AT, 0);
  if (lastPageBatch && Date.now() - lastPageBatch < pageIntervalMs) return;

  await runICollectPageScrapeBatch(db);
}

export function maybeScheduleICollectCatalogSync(): void {
  if (!isICollectCatalogSyncEnabled()) return;

  const state = globalSyncState();
  if (state.syncScheduled || state.syncRunning) return;
  state.syncScheduled = true;

  void enqueueBackgroundWorkJob({
    kind: BACKGROUND_WORK_KIND.icollectCatalogSync,
    payload: { tick: true },
    replaceOpenForKind: true,
  })
    .then(() => {
      state.syncScheduled = false;
    })
    .catch((error) => {
      state.syncScheduled = false;
      console.warn("[iCollect sync] failed to enqueue tick:", error);
    });
}

export function startICollectCatalogSyncLoop(): void {
  if (!isICollectCatalogSyncEnabled()) return;

  const state = globalSyncState();
  if (state.loopStarted) return;
  state.loopStarted = true;

  const checkMs = readPositiveInt(
    "ICOLLECT_SYNC_CHECK_MS",
    DEFAULT_SYNC_CHECK_MS,
  );

  maybeScheduleICollectCatalogSync();

  setInterval(() => {
    maybeScheduleICollectCatalogSync();
  }, checkMs).unref?.();
}

/** @internal */
export function resetICollectCatalogSyncForTests(): void {
  const root = globalThis as typeof globalThis &
    Record<string, GlobalSyncState>;
  delete root[globalStateKey];
}
