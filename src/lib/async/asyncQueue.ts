type QueueTask = {
  fn: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

/** File FIFO à concurrence bornée (extraite de providerQueue pour partage). */
export class AsyncQueue {
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
