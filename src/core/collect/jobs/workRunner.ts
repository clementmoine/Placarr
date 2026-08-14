import type { Prisma, Type } from "@/generated/prisma/browser";

import {
  adoptItemMetadataRefreshOnWorker,
  finishItemMetadataRefresh,
  isAbortError,
  type ItemMetadataRefreshSession,
} from "@/core/collect/jobs/metadataRefreshSession";
import {
  BACKGROUND_WORK_KIND,
  enqueueBackgroundWorkJob,
  isBackgroundWorkJobCancelled,
  touchBackgroundWorkJobLock,
  type BackgroundWorkJobRow,
  type FoilExtractJobPayload,
  type MetadataRefreshJobPayload,
  type PriceRefreshJobPayload,
} from "@/core/collect/jobs/workQueue";
import { BackgroundWorkAbandonedError } from "@/core/collect/jobs/workJobOutcome";
import {
  isCoverResolutionAcceptable,
  readFileImageMetrics,
} from "@/core/enrich/media/imageMetrics";
import { fetchAndStoreMetadata } from "@/core/enrich";
import { resolveGameMetadataPlatform } from "@/core/enrich/platform";
import {
  itemPricesContextFromRecord,
  itemPricesRefreshForceReason,
  refreshItemPricesFromContext,
  type ItemPricesContext,
} from "@/core/commerce/pricing/itemDisplay";
import { repairProviderExternalLinksForItem } from "@/core/enrich/persistProviderExternalLinks";
import { attachSeriesSiblingBarcodesFromProviders } from "@/core/collect/seriesSiblingBarcodes";
import { prisma } from "@/lib/db/prisma";
import { runWithJobAbortSignal } from "@/lib/http/jobAbort";
import {
  foilExtractTimeoutMs,
  normalizeFoilExtractScope,
  normalizeFoilExtractTarget,
  runFoilExtractCommand,
} from "@/lib/admin/foilExtractRunner";
import path from "path";

const CANCEL_POLL_MS = 2_000;
/** Foil CDN scrapes can run 15–40 min — refresh lock so stale recovery stays off. */
const FOIL_LOCK_HEARTBEAT_MS = 60_000;
/** Hard ceiling: spinner must not sit forever behind Flare scrapes. */
const METADATA_JOB_TIMEOUT_MS = 90_000;
/** Price scrapes must not monopolize every worker slot for minutes. */
const PRICE_JOB_TIMEOUT_MS = 60_000;

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      resolve(undefined);
    }, timeoutMs);
    if (typeof timer.unref === "function") timer.unref();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function prepareItemForMetadataRefresh(input: {
  itemId: string;
  clearRemoteCover?: boolean;
}): Promise<void> {
  if (input.clearRemoteCover) {
    const item = await prisma.item.findUnique({
      where: { id: input.itemId },
      select: { imageUrl: true },
    });
    if (item?.imageUrl?.startsWith("http")) {
      await prisma.item.update({
        where: { id: input.itemId },
        data: { imageUrl: null },
      });
    }
  }

  const itemForCoverReset = await prisma.item.findUnique({
    where: { id: input.itemId },
    select: { imageUrl: true },
  });
  if (itemForCoverReset?.imageUrl?.startsWith("/uploads/")) {
    const metrics = await readFileImageMetrics(
      path.join(process.cwd(), "public", itemForCoverReset.imageUrl),
    );
    if (!isCoverResolutionAcceptable(metrics)) {
      await prisma.item.update({
        where: { id: input.itemId },
        data: { imageUrl: null },
      });
    }
  }
}

async function enqueuePricesAfterMetadata(itemId: string): Promise<void> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { shelf: true, metadata: true },
  });
  if (!item) return;

  try {
    await repairProviderExternalLinksForItem(itemId);
    const context = itemPricesContextFromRecord(item);
    const forceReason = await itemPricesRefreshForceReason(context);
    if (!forceReason) return;

    // Soft for age/missing; force when an approved fiche URL disagrees with the
    // cached reference offer (generic Slim vs Pink pin).
    const force = forceReason === "approved-fiche-mismatch";

    await enqueueBackgroundWorkJob({
      kind: BACKGROUND_WORK_KIND.priceRefresh,
      itemId: context.id,
      userId: item.userId,
      replaceOpenForItem: true,
      payload: {
        id: context.id,
        barcode: context.barcode,
        name: context.name,
        metadataId: context.metadataId,
        metadataTitle: context.metadataTitle,
        metadataAliases: context.metadataAliases,
        metadataReleaseDate: context.metadataReleaseDate,
        metadataPlatformKey: context.metadataPlatformKey,
        metadataExternalIds: context.metadataExternalIds,
        metadataBarcodes: context.metadataBarcodes,
        metadataFacts: context.metadataFacts,
        shelfType: context.shelfType,
        shelfName: context.shelfName,
        printKey: context.printKey,
        force,
      } as unknown as Prisma.InputJsonValue,
    });
  } catch (error) {
    console.error(
      `[Prices] Failed to enqueue post-metadata refresh for item ${itemId}:`,
      error,
    );
  }
}

/** Seed ISBN → series siblings EANs → soft price enqueue for newly barcoded. */
async function attachSeriesBarcodesAfterMetadata(
  itemId: string,
): Promise<void> {
  try {
    const { attached } = await attachSeriesSiblingBarcodesFromProviders(itemId);
    for (const row of attached) {
      await enqueuePricesAfterMetadata(row.itemId);
    }
  } catch (error) {
    console.error(
      `[SeriesBarcodes] Failed to attach sibling EANs for item ${itemId}:`,
      error,
    );
  }
}

function watchJobCancellation(
  jobId: string,
  session: ItemMetadataRefreshSession & { controller: AbortController },
): () => void {
  const timer = setInterval(() => {
    void (async () => {
      if (session.signal.aborted) return;
      if (await isBackgroundWorkJobCancelled(jobId)) {
        session.controller.abort();
      }
    })();
  }, CANCEL_POLL_MS);
  if (typeof timer.unref === "function") timer.unref();
  return () => clearInterval(timer);
}

export async function executeMetadataRefreshJob(
  job: BackgroundWorkJobRow,
  payload: MetadataRefreshJobPayload,
): Promise<void> {
  if (await isBackgroundWorkJobCancelled(job.id)) {
    await finishItemMetadataRefresh(payload.itemId, payload.generation);
    throw new BackgroundWorkAbandonedError("cancelled");
  }

  const adopted = await adoptItemMetadataRefreshOnWorker(
    payload.itemId,
    payload.generation,
  );
  if (!adopted) {
    throw new BackgroundWorkAbandonedError(
      "superseded",
      `Metadata refresh superseded for item ${payload.itemId} generation ${payload.generation}`,
    );
  }

  const stopWatch = watchJobCancellation(job.id, adopted);
  const jobTimeout = setTimeout(() => {
    if (!adopted.signal.aborted) {
      console.warn(
        `[MetadataRefresh] Job timeout after ${METADATA_JOB_TIMEOUT_MS}ms for item ${payload.itemId}`,
      );
      adopted.controller.abort();
    }
  }, METADATA_JOB_TIMEOUT_MS);
  if (typeof jobTimeout.unref === "function") jobTimeout.unref();

  let stored = false;
  let abandoned: BackgroundWorkAbandonedError | null = null;
  try {
    await prepareItemForMetadataRefresh(payload);
    const platform = resolveGameMetadataPlatform(
      undefined,
      payload.shelfName,
      payload.shelfType as Type,
    );
    const result = await fetchAndStoreMetadata(
      payload.itemId,
      payload.lookupQuery,
      payload.shelfType as Type,
      payload.barcode || undefined,
      payload.forceRefresh ?? true,
      platform,
      payload.bypassMetadataCache ?? true,
      true,
      payload.shelfName,
      adopted,
    );
    stored = Boolean(result);
    if (adopted.signal.aborted && !stored) {
      abandoned = new BackgroundWorkAbandonedError("cancelled");
    }
    if (!stored && !adopted.signal.aborted) {
      console.warn(
        `[MetadataRefresh] Empty store for item ${payload.itemId} lookup="${payload.lookupQuery}" (providers returned nothing durable)`,
      );
    }
  } catch (error) {
    if (!isAbortError(error)) {
      console.error(
        `[MetadataRefresh] Worker refresh failed for ${payload.itemId}:`,
        error,
      );
      throw error;
    }
    // Soft timeout / cancel: keep any partial store; finish still clears spinner.
    abandoned = new BackgroundWorkAbandonedError("cancelled");
  } finally {
    clearTimeout(jobTimeout);
    stopWatch();
    await finishItemMetadataRefresh(payload.itemId, payload.generation);
  }

  // Prices run as a separate queue job so metadata spinner can clear first.
  if (stored) {
    await attachSeriesBarcodesAfterMetadata(payload.itemId);
    await enqueuePricesAfterMetadata(payload.itemId);
  }

  if (abandoned && !stored) {
    throw abandoned;
  }
}

export async function executePriceRefreshJob(
  payload: PriceRefreshJobPayload,
): Promise<void> {
  // Prefer live item row over the enqueue-time payload: older jobs omitted
  // printKey, and metadata aliases (EN titles for Lorcast) can land after the
  // price job was queued.
  const item = await prisma.item.findUnique({
    where: { id: payload.id },
    include: { shelf: true, metadata: true },
  });
  const context: ItemPricesContext = item
    ? itemPricesContextFromRecord(item)
    : {
        id: payload.id,
        barcode: payload.barcode,
        name: payload.name,
        metadataId: payload.metadataId,
        metadataTitle: payload.metadataTitle,
        metadataAliases: payload.metadataAliases,
        metadataReleaseDate: payload.metadataReleaseDate,
        metadataPlatformKey: payload.metadataPlatformKey,
        metadataExternalIds: payload.metadataExternalIds,
        metadataBarcodes: payload.metadataBarcodes,
        metadataFacts:
          payload.metadataFacts as ItemPricesContext["metadataFacts"],
        shelfType: payload.shelfType,
        shelfName: payload.shelfName,
        printKey: payload.printKey,
      };

  const controller = new AbortController();
  try {
    const result = await withTimeout(
      runWithJobAbortSignal(controller.signal, () =>
        refreshItemPricesFromContext(context, {
          force: payload.force,
          signal: controller.signal,
        }),
      ),
      PRICE_JOB_TIMEOUT_MS,
      () => {
        console.warn(
          `[PriceRefresh] Job timeout after ${PRICE_JOB_TIMEOUT_MS}ms for item ${payload.id}`,
        );
        controller.abort();
      },
    );
    if (result === undefined) {
      // Timed out: keep whatever offers were already persisted; free the slot.
      // AbortSignal stops further Flare/HTTP work (ALS + concurrency gate).
      return;
    }

    if (payload.shelfType === "books" && payload.barcode) {
      await attachSeriesBarcodesAfterMetadata(payload.id);
    }
  } catch (error) {
    if (isAbortError(error)) {
      return;
    }
    throw error;
  }
}

export async function executeBackgroundWorkJob(
  job: BackgroundWorkJobRow,
): Promise<void> {
  const payload = job.payload as unknown;

  if (job.kind === BACKGROUND_WORK_KIND.metadataRefresh) {
    await executeMetadataRefreshJob(job, payload as MetadataRefreshJobPayload);
    return;
  }

  if (job.kind === BACKGROUND_WORK_KIND.priceRefresh) {
    await executePriceRefreshJob(payload as PriceRefreshJobPayload);
    return;
  }

  if (job.kind === BACKGROUND_WORK_KIND.icollectCatalogSync) {
    const { refreshICollectCatalog } = await import(
      "@/providers/icollect/pipeline"
    );
    await refreshICollectCatalog({ auto: true });
    return;
  }

  if (job.kind === BACKGROUND_WORK_KIND.launchboxIndexSync) {
    const { refreshLaunchBoxCatalog } = await import(
      "@/providers/launchbox/pipeline"
    );
    await refreshLaunchBoxCatalog();
    return;
  }

  if (job.kind === BACKGROUND_WORK_KIND.nointroIndexSync) {
    const { refreshNoIntroCatalog } = await import(
      "@/providers/nointro/pipeline"
    );
    // Legacy kind — treat like auto when no DAT is configured (skip, don't fail).
    await refreshNoIntroCatalog({ auto: true });
    return;
  }

  if (job.kind === BACKGROUND_WORK_KIND.catalogProviderSync) {
    const providerId =
      typeof payload.providerId === "string" ? payload.providerId.trim() : "";
    if (!providerId) throw new Error("catalogProviderSync requires providerId");
    const { getCatalogProviderModule } = await import("@/core/catalog/catalog");
    const mdl = getCatalogProviderModule(providerId);
    if (!mdl?.catalog) {
      throw new Error(`No catalog hooks for provider ${providerId}`);
    }
    await mdl.catalog.refresh({
      auto: Boolean(payload.auto),
    });
    return;
  }

  if (job.kind === BACKGROUND_WORK_KIND.foilExtract) {
    await executeFoilExtractJob(job, payload as FoilExtractJobPayload);
    return;
  }

  throw new Error(`Unknown background work kind: ${job.kind}`);
}

async function stampFoilExtractFailure(
  pack: string,
  jobId: string,
  message: string,
): Promise<void> {
  try {
    const { appendFoilExtractLog, beginFoilExtractLog } = await import(
      "@/lib/admin/foilExtractLog"
    );
    const { readFoilExtractLog } = await import("@/lib/admin/foilExtractLog");
    const { isFoilExtractTarget } = await import(
      "@/lib/admin/foilExtractRunner"
    );
    if (!isFoilExtractTarget(pack)) return;
    const typed = pack;
    const existing = await readFoilExtractLog(typed, {
      after: 0,
      maxBytes: 64,
    });
    // Keep any scrape tail already on disk — only seed a fresh header when empty.
    if (!existing.exists || existing.size === 0) {
      await beginFoilExtractLog(typed, [`jobId=${jobId}`]);
    }
    await appendFoilExtractLog(typed, `status=failed`);
    await appendFoilExtractLog(typed, message);
  } catch {
    /* log must not mask the real failure */
  }
}

async function executeFoilExtractJob(
  job: BackgroundWorkJobRow,
  payload: FoilExtractJobPayload,
): Promise<void> {
  const rawTarget = String(payload?.target ?? "").trim();
  const target = normalizeFoilExtractTarget(rawTarget);
  if (!target) {
    const message = `Invalid foil extract target: ${rawTarget || "(empty)"}`;
    if (rawTarget) await stampFoilExtractFailure(rawTarget, job.id, message);
    throw new Error(message);
  }

  const controller = new AbortController();
  const cancelPoll = setInterval(() => {
    void isBackgroundWorkJobCancelled(job.id).then((cancelled) => {
      if (cancelled) controller.abort();
    });
  }, CANCEL_POLL_MS);
  if (typeof cancelPoll.unref === "function") cancelPoll.unref();

  const heartbeat = setInterval(() => {
    void touchBackgroundWorkJobLock(job.id);
  }, FOIL_LOCK_HEARTBEAT_MS);
  if (typeof heartbeat.unref === "function") heartbeat.unref();
  // Fresh lock immediately so a slow spawn is still covered.
  void touchBackgroundWorkJobLock(job.id);

  const logTail: string[] = [];
  const writeLog = (line: string) => {
    logTail.push(line);
    if (logTail.length > 40) logTail.shift();
    if (logTail.length % 20 === 0) {
      console.info(`[FoilExtract ${target}] ${line}`);
    }
  };

  try {
    await runFoilExtractCommand(target, {
      signal: controller.signal,
      timeoutMs: foilExtractTimeoutMs(
        target,
        normalizeFoilExtractScope(payload?.scope),
      ),
      onLog: writeLog,
      logHeader: [`jobId=${job.id}`],
      scope: normalizeFoilExtractScope(payload?.scope),
    });
  } catch (error) {
    if (
      controller.signal.aborted ||
      (await isBackgroundWorkJobCancelled(job.id))
    ) {
      return;
    }
    const tail = logTail.slice(-8).join("\n");
    const message = error instanceof Error ? error.message : String(error);
    await stampFoilExtractFailure(
      target,
      job.id,
      tail ? `${message}\n---\n${tail}` : message,
    );
    throw new Error(tail ? `${message}\n---\n${tail}` : message);
  } finally {
    clearInterval(cancelPoll);
    clearInterval(heartbeat);
  }
}
