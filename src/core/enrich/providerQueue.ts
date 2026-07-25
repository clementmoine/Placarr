import { AsyncQueue, type QueuePriority } from "@/lib/async/asyncQueue";
import { runWithConcurrency } from "@/lib/async/runWithConcurrency";
import { yieldToEventLoop } from "@/lib/async/yieldToEventLoop";
import { recordProviderResolve } from "@/core/enrich/providerRuntimeStats";
import type {
  MetadataAdapterContext,
  MetadataProviderAdapter,
} from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";
import type { MediaType, ProviderInfo } from "@/types/providerRegistry";
import { isAbortError, throwIfAborted } from "@/lib/http/abort";

class ProviderQueue {
  private readonly queue: AsyncQueue;
  private lastStartedAt = 0;

  constructor(
    concurrency: number,
    private readonly minIntervalMs = 0,
  ) {
    this.queue = new AsyncQueue(concurrency);
  }

  run<T>(fn: () => Promise<T>, priority: QueuePriority = "normal"): Promise<T> {
    return this.queue.run(async () => {
      if (this.minIntervalMs > 0) {
        const waitMs = this.lastStartedAt + this.minIntervalMs - Date.now();
        if (waitMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
        this.lastStartedAt = Date.now();
      }
      return fn();
    }, priority);
  }
}

const DEFAULT_PROVIDER_CONCURRENCY = 1;

/**
 * Parallel calls allowed to an API/local provider that declares neither a rate
 * limit nor a min interval. Keeping every provider at 1 made a same-type batch
 * serialize on each provider's queue once the pools were split (#2).
 */
export const API_PROVIDER_CONCURRENCY = 3;

export type ProviderQueueSettings = {
  concurrency: number;
  minIntervalMs: number;
};

/**
 * Queue shape for a provider, derived from its own registry traits — core
 * never learns provider ids. Anything that can be rate-limited stays serial:
 * a declared interval, the `rateLimited` flag, or a scrape (be polite, and
 * FlareSolverr is serial upstream anyway).
 */
export function providerQueueSettings(
  info: Pick<
    ProviderInfo,
    "auth" | "rateLimited" | "minRequestIntervalMs" | "maxConcurrentRequests"
  >,
): ProviderQueueSettings {
  const minIntervalMs = info.minRequestIntervalMs ?? 0;
  const mustSerialize =
    minIntervalMs > 0 ||
    Boolean(info.rateLimited) ||
    info.auth.kind === "scrape";
  const concurrency =
    info.maxConcurrentRequests ??
    (mustSerialize ? DEFAULT_PROVIDER_CONCURRENCY : API_PROVIDER_CONCURRENCY);
  return { concurrency: Math.max(1, concurrency), minIntervalMs };
}

const providerQueues = new Map<string, ProviderQueue>();
const providerSettings = new Map<string, ProviderQueueSettings>();

/**
 * Register a provider's queue shape. Called once per provider from the adapter
 * bootstrap; unregistered ids fall back to a serial queue.
 */
export function configureProviderQueue(
  providerId: string,
  info: Parameters<typeof providerQueueSettings>[0],
): void {
  providerSettings.set(providerId, providerQueueSettings(info));
  providerQueues.delete(providerId);
}

/**
 * Cross-provider fan-out for one enrich. Background runs out-of-process
 * (`pnpm worker`), so stage concurrency can match interactive without
 * starving the Next request loop. Yields between providers still apply.
 */
export const STAGE_RESOLVE_CONCURRENCY_BACKGROUND = 5;
export const STAGE_RESOLVE_CONCURRENCY_INTERACTIVE = 5;

/** Soft ceiling so one hung Flare scrape cannot stall the whole enrich. */
export const PROVIDER_RESOLVE_TIMEOUT_BACKGROUND_MS = 20_000;
export const PROVIDER_RESOLVE_TIMEOUT_INTERACTIVE_MS = 35_000;

function resolveProviderTimeoutMs(isBackground?: boolean): number {
  const envRaw = Number.parseInt(
    process.env.METADATA_PROVIDER_TIMEOUT_MS || "",
    10,
  );
  if (Number.isFinite(envRaw) && envRaw > 0) return envRaw;
  return isBackground
    ? PROVIDER_RESOLVE_TIMEOUT_BACKGROUND_MS
    : PROVIDER_RESOLVE_TIMEOUT_INTERACTIVE_MS;
}

function getProviderQueue(providerId: string): ProviderQueue {
  const existing = providerQueues.get(providerId);
  if (existing) return existing;

  const settings = providerSettings.get(providerId);
  const queue = new ProviderQueue(
    settings?.concurrency ?? DEFAULT_PROVIDER_CONCURRENCY,
    settings?.minIntervalMs ?? 0,
  );
  providerQueues.set(providerId, queue);
  return queue;
}

export function runQueuedMetadataProviderCall<T>(
  providerId: string,
  fn: () => Promise<T>,
  priority: QueuePriority = "normal",
): Promise<T> {
  return getProviderQueue(providerId).run(fn, priority);
}

export function wrapMetadataProviderAdapter(
  adapter: MetadataProviderAdapter,
): MetadataProviderAdapter {
  return {
    id: adapter.id,
    resolve: (ctx) => {
      throwIfAborted(ctx.signal);
      const priority =
        ctx.queuePriority ?? (ctx.isBackground ? "normal" : "high");
      return runQueuedMetadataProviderCall(
        adapter.id,
        () => {
          throwIfAborted(ctx.signal);
          return adapter.resolve(ctx);
        },
        priority,
      );
    },
  };
}

async function resolveProviderWithTimeout(
  adapter: MetadataProviderAdapter,
  ctx: MetadataAdapterContext,
  mediaType?: MediaType | null,
): Promise<MetadataResult | null> {
  throwIfAborted(ctx.signal);
  const timeoutMs = resolveProviderTimeoutMs(ctx.isBackground);
  const startedAt = Date.now();

  const timeoutController = new AbortController();
  const onParentAbort = () => timeoutController.abort();
  ctx.signal?.addEventListener("abort", onParentAbort, { once: true });
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
  if (typeof timer.unref === "function") timer.unref();

  let hit = false;
  let timedOut = false;
  try {
    const value = await adapter.resolve({
      ...ctx,
      signal: timeoutController.signal,
    });
    hit = Boolean(value);
    return value;
  } catch (error) {
    if (ctx.signal?.aborted) throw error;
    if (isAbortError(error) && timeoutController.signal.aborted) {
      timedOut = true;
      console.warn(
        `[MetadataProviderQueue] Provider "${adapter.id}" timed out after ${timeoutMs}ms (soft guard — continuing batch)`,
      );
      return null;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    ctx.signal?.removeEventListener("abort", onParentAbort);
    recordProviderResolve({
      providerId: adapter.id,
      mediaType,
      durationMs: timedOut ? timeoutMs : Math.max(0, Date.now() - startedAt),
      hit,
    });
  }
}

export type ResolveMetadataProvidersOptions = {
  /** Shelf media type for runtime priority stats. */
  mediaType?: MediaType | null;
  /**
   * Fires as each provider finishes (success, miss, or soft timeout).
   * Used for progressive mid-batch stores — never skips remaining providers.
   */
  onProviderResult?: (input: {
    providerId: string;
    result: MetadataResult | null;
    byProvider: Map<string, MetadataResult | null>;
  }) => void | Promise<void>;
};

export async function resolveMetadataProvidersInOrder(
  providerIds: string[],
  ctx: MetadataAdapterContext,
  adapters: Map<string, MetadataProviderAdapter>,
  options?: ResolveMetadataProvidersOptions,
): Promise<Map<string, MetadataResult | null>> {
  throwIfAborted(ctx.signal);
  const byProvider = new Map<string, MetadataResult | null>();
  const concurrency = ctx.isBackground
    ? STAGE_RESOLVE_CONCURRENCY_BACKGROUND
    : STAGE_RESOLVE_CONCURRENCY_INTERACTIVE;
  const mediaType = options?.mediaType ?? null;

  // Serialize progressive callbacks so stores do not race.
  let progressiveChain: Promise<void> = Promise.resolve();

  const results = await runWithConcurrency(
    providerIds,
    concurrency,
    async (providerId) => {
      if (ctx.isBackground) await yieldToEventLoop();
      const adapter = adapters.get(providerId);
      if (!adapter) {
        byProvider.set(providerId, null);
        return { providerId, value: null as MetadataResult | null };
      }
      try {
        const value = await resolveProviderWithTimeout(adapter, ctx, mediaType);
        byProvider.set(providerId, value);
        if (options?.onProviderResult) {
          const callback = options.onProviderResult;
          progressiveChain = progressiveChain.then(() =>
            Promise.resolve(
              callback({
                providerId,
                result: value,
                byProvider,
              }),
            ),
          );
        }
        if (ctx.isBackground) await yieldToEventLoop();
        return { providerId, value };
      } catch (error) {
        if (isAbortError(error)) throw error;
        console.warn(
          `[MetadataProviderQueue] Provider "${providerId}" failed`,
          error,
        );
        byProvider.set(providerId, null);
        if (options?.onProviderResult) {
          const callback = options.onProviderResult;
          progressiveChain = progressiveChain.then(() =>
            Promise.resolve(
              callback({
                providerId,
                result: null,
                byProvider,
              }),
            ),
          );
        }
        return { providerId, value: null };
      }
    },
  );

  await progressiveChain;

  // Rebuild map in providerIds order for deterministic downstream merge.
  const ordered = new Map<string, MetadataResult | null>();
  for (const providerId of providerIds) {
    ordered.set(
      providerId,
      byProvider.has(providerId)
        ? byProvider.get(providerId)!
        : (results.find((row) => row.providerId === providerId)?.value ?? null),
    );
  }

  return ordered;
}

export function resetMetadataProviderQueuesForTests(): void {
  providerQueues.clear();
  providerSettings.clear();
}
