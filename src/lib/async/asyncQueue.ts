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
