/**
 * Un job de la file marqué `cancelled` s'arrête pendant qu'il tourne
 * (ADR-003, addendum 2026-11-23) — la Sync catalogue n'avait aucune
 * annulation : « Annuler » dans l'admin laissait la moisson aller au bout.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getJobAbortSignal } from "@/lib/http/jobAbort";
import type { ProviderCatalogRefreshOpts } from "@/types/providerModule";

const h = vi.hoisted(() => ({
  cancelled: false,
  refresh: vi.fn(),
  ensurePackClient: vi.fn(),
  enqueuePrintCatalogPropagate: vi.fn(),
}));

vi.mock("@/core/collect/jobs/workQueue", () => ({
  BACKGROUND_WORK_KIND: {
    metadataRefresh: "metadataRefresh",
    priceRefresh: "priceRefresh",
    icollectCatalogSync: "icollectCatalogSync",
    launchboxIndexSync: "launchboxIndexSync",
    nointroIndexSync: "nointroIndexSync",
    catalogProviderSync: "catalogProviderSync",
    catalogueExtract: "foilExtract",
    apkStoreFetch: "apkStoreFetch",
  },
  enqueueBackgroundWorkJob: vi.fn(),
  isBackgroundWorkJobCancelled: vi.fn(async () => h.cancelled),
  touchBackgroundWorkJobLock: vi.fn(async () => true),
  mergeBackgroundWorkJobPayload: vi.fn(async () => undefined),
  mergeCatalogueExtractCompletedStep: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

vi.mock("@/core/catalog/catalog", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getCatalogProviderModule: () => ({
    catalog: { dataPack: "test/pack", refresh: h.refresh },
  }),
}));

vi.mock("@/lib/admin/cataloguePacks", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  cataloguePackInfo: () => null,
}));

vi.mock("@/lib/admin/catalogueClient", () => ({
  ensurePackClient: h.ensurePackClient,
}));

vi.mock("@/core/collect/jobs/printCatalogPropagate", () => ({
  enqueuePrintCatalogPropagate: h.enqueuePrintCatalogPropagate,
}));

import { isBackgroundWorkInterruptedError } from "./workJobOutcome";
import { executeBackgroundWorkJob } from "./workRunner";
import type { BackgroundWorkJobRow } from "./workQueue";

const job = {
  id: "job-sync",
  kind: "catalogProviderSync",
  payload: { providerId: "testpack" },
  attempts: 1,
  itemId: null,
  userId: null,
} as unknown as BackgroundWorkJobRow;

/** A harvest step that only ends when the job is aborted. */
async function harvestUntilAborted(
  opts?: ProviderCatalogRefreshOpts,
): Promise<void> {
  const signal = opts?.signal;
  if (!signal) throw new Error("refresh got no signal");
  // HTTP reads the ALS — same signal.
  if (getJobAbortSignal() !== signal) throw new Error("ALS not set");
  await new Promise<void>((_, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
  });
}

describe("executeBackgroundWorkJob — catalogProviderSync cancellation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.cancelled = false;
    h.refresh.mockReset();
    h.ensurePackClient.mockReset().mockResolvedValue({ status: "none" });
    h.enqueuePrintCatalogPropagate.mockReset().mockResolvedValue(0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stops the running refresh once the job is marked cancelled", async () => {
    h.refresh.mockImplementation(harvestUntilAborted);
    const run = executeBackgroundWorkJob(job);
    await vi.waitFor(() => expect(h.refresh).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(2_000);
    h.cancelled = true;
    await vi.advanceTimersByTimeAsync(4_000);
    await expect(run).resolves.toBeUndefined();
    // Cancelled mid-run: no shelf propagation of a half Sync.
    expect(h.enqueuePrintCatalogPropagate).not.toHaveBeenCalled();
  });

  it("hands the game client step the job signal", async () => {
    h.refresh.mockResolvedValue(undefined);
    await executeBackgroundWorkJob(job);
    const opts = h.ensurePackClient.mock.calls[0]?.[1] as {
      signal?: AbortSignal;
    };
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it("reports a worker interruption (drain deadline) as interrupted", async () => {
    h.refresh.mockImplementation(harvestUntilAborted);
    const outer = new AbortController();
    const run = executeBackgroundWorkJob(job, { signal: outer.signal });
    await vi.waitFor(() => expect(h.refresh).toHaveBeenCalled());
    outer.abort(new Error("drain deadline"));
    const error = await run.catch((e: unknown) => e);
    expect(isBackgroundWorkInterruptedError(error)).toBe(true);
  });
});
