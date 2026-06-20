import type {
  MetadataAdapterContext,
  MetadataProviderAdapter,
} from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";

type QueueTask = {
  fn: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

class AsyncQueue {
  private activeCount = 0;
  private pending: QueueTask[] = [];

  constructor(private readonly concurrency: number) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.push({
        fn: fn as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.schedule();
    });
  }

  private schedule(): void {
    while (this.activeCount < this.concurrency && this.pending.length > 0) {
      const task = this.pending.shift();
      if (!task) return;
      this.activeCount++;
      void task
        .fn()
        .then(task.resolve, task.reject)
        .finally(() => {
          this.activeCount--;
          this.schedule();
        });
    }
  }
}

class ProviderQueue {
  private readonly queue: AsyncQueue;
  private lastStartedAt = 0;

  constructor(
    concurrency: number,
    private readonly minIntervalMs = 0,
  ) {
    this.queue = new AsyncQueue(concurrency);
  }

  run<T>(fn: () => Promise<T>): Promise<T> {
    return this.queue.run(async () => {
      if (this.minIntervalMs > 0) {
        const waitMs = this.lastStartedAt + this.minIntervalMs - Date.now();
        if (waitMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
        this.lastStartedAt = Date.now();
      }
      return fn();
    });
  }
}

const DEFAULT_PROVIDER_CONCURRENCY = 1;

const PROVIDER_CONCURRENCY: Record<string, number> = {
  launchbox: 2,
  coverproject: 2,
};

const PROVIDER_MIN_INTERVAL_MS: Record<string, number> = {
  screenscraper: 1_100,
  igdb: 250,
  thegamesdb: 250,
  howlongtobeat: 500,
  rawg: 250,
  pricecharting: 500,
};

const providerQueues = new Map<string, ProviderQueue>();

function getProviderQueue(providerId: string): ProviderQueue {
  const existing = providerQueues.get(providerId);
  if (existing) return existing;

  const queue = new ProviderQueue(
    PROVIDER_CONCURRENCY[providerId] ?? DEFAULT_PROVIDER_CONCURRENCY,
    PROVIDER_MIN_INTERVAL_MS[providerId] ?? 0,
  );
  providerQueues.set(providerId, queue);
  return queue;
}

export function runQueuedMetadataProviderCall<T>(
  providerId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return getProviderQueue(providerId).run(fn);
}

export function wrapMetadataProviderAdapter(
  adapter: MetadataProviderAdapter,
): MetadataProviderAdapter {
  return {
    id: adapter.id,
    resolve: (ctx) =>
      runQueuedMetadataProviderCall(adapter.id, () => adapter.resolve(ctx)),
  };
}

export async function resolveMetadataProvidersInOrder(
  providerIds: string[],
  ctx: MetadataAdapterContext,
  adapters: Map<string, MetadataProviderAdapter>,
): Promise<Map<string, MetadataResult | null>> {
  const byProvider = new Map<string, MetadataResult | null>();
  const calls = providerIds.flatMap((providerId) => {
    const adapter = adapters.get(providerId);
    if (!adapter) return [];
    return [
      adapter
        .resolve(ctx)
        .then((value) => ({ providerId, value }))
        .catch((error) => {
          console.warn(
            `[MetadataProviderQueue] Provider "${providerId}" failed`,
            error,
          );
          return { providerId, value: null };
        }),
    ];
  });

  const results = await Promise.all(calls);
  for (const providerId of providerIds) {
    const result = results.find((item) => item.providerId === providerId);
    if (result) byProvider.set(providerId, result.value);
  }

  return byProvider;
}

export function resetMetadataProviderQueuesForTests(): void {
  providerQueues.clear();
}
