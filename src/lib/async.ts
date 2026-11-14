/**
 * Async concurrency helpers — queues, caps, serialization, event-loop yield.
 */

export type QueuePriority = "high" | "normal";

type QueueTask = {
  fn: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

/** File à concurrence bornée avec priorité haute (interactive) vs normale (background). */
export class AsyncQueue {
  private activeCount = 0;
  private highPending: QueueTask[] = [];
  private normalPending: QueueTask[] = [];

  constructor(private readonly concurrency: number) {}

  run<T>(fn: () => Promise<T>, priority: QueuePriority = "normal"): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task = {
        fn: fn as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      };
      if (priority === "high") {
        this.highPending.push(task);
      } else {
        this.normalPending.push(task);
      }
      this.schedule();
    });
  }

  private dequeue(): QueueTask | undefined {
    return this.highPending.shift() ?? this.normalPending.shift();
  }

  private schedule(): void {
    while (
      this.activeCount < this.concurrency &&
      (this.highPending.length > 0 || this.normalPending.length > 0)
    ) {
      const task = this.dequeue();
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

/** Runs async work over items with a fixed concurrency cap. */
export async function runWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  options?: { signal?: AbortSignal },
): Promise<R[]> {
  if (items.length === 0) return [];

  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      if (options?.signal?.aborted) return;
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), items.length) },
      runWorker,
    ),
  );

  return results;
}

/** Serializes async work so only one caller runs at a time. */
export function createSerializeAsync() {
  let chain: Promise<unknown> = Promise.resolve();

  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      const next = chain.then(fn, fn);
      chain = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
  };
}

/**
 * Let the Node event loop flush pending I/O (HTTP, timers) before continuing.
 *
 * Used inside worker slots and residual in-process pools so long synchronous
 * stretches (HTML parse, sharp setup) do not starve other queued work.
 */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}
