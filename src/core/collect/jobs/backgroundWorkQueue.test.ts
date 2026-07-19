import { describe, expect, it } from "vitest";

import { AsyncQueue } from "@/lib/async/asyncQueue";
import {
  runBackgroundWork,
  runCpuBackgroundWork,
} from "@/core/collect/jobs/backgroundWorkQueue";

async function measurePeakConcurrency(
  run: (fn: () => Promise<void>) => Promise<void>,
  jobs: number,
): Promise<number> {
  let active = 0;
  let maxActive = 0;
  await Promise.all(
    Array.from({ length: jobs }, () =>
      run(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
      }),
    ),
  );
  return maxActive;
}

/**
 * Le worker (`pnpm worker`) exécute l'enrichissement hors process Next : sans
 * plafond de concurrence, N jobs simultanés saturent Flare / le host.
 * Ces tests verrouillent la borne de concurrence des pools résiduels in-process.
 */
describe("AsyncQueue", () => {
  it("ne dépasse jamais la concurrence configurée", async () => {
    const queue = new AsyncQueue(2);
    let active = 0;
    let maxActive = 0;

    const job = () =>
      queue.run(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
      });

    await Promise.all(Array.from({ length: 10 }, job));
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("une tâche qui échoue ne bloque pas les suivantes", async () => {
    const queue = new AsyncQueue(1);
    const order: string[] = [];

    const failing = queue
      .run(async () => {
        order.push("fail");
        throw new Error("boom");
      })
      .catch(() => order.push("caught"));
    const following = queue.run(async () => {
      order.push("next");
    });

    await Promise.all([failing, following]);
    expect(order).toEqual(["fail", "caught", "next"]);
  });

  it("propage la valeur de retour", async () => {
    const queue = new AsyncQueue(1);
    await expect(queue.run(async () => 42)).resolves.toBe(42);
  });
});

describe("runBackgroundWork (pool I/O)", () => {
  it("borne le travail I/O pour ne pas saturer l'event loop", async () => {
    const configured = Number.parseInt(
      process.env.BACKGROUND_IO_CONCURRENCY ||
        process.env.BACKGROUND_WORK_CONCURRENCY ||
        "4",
      10,
    );
    const maxActive = await measurePeakConcurrency(runBackgroundWork, 8);
    expect(maxActive).toBeGreaterThan(0);
    expect(maxActive).toBeLessThanOrEqual(
      Number.isFinite(configured) && configured > 0 ? configured : 4,
    );
  });

  it("yields so other macrotasks can run while a job is queued", async () => {
    let interleaved = false;
    const job = runBackgroundWork(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return "done";
    });
    setImmediate(() => {
      interleaved = true;
    });
    await job;
    expect(interleaved).toBe(true);
  });
});

describe("runCpuBackgroundWork (pool CPU)", () => {
  it("borne le travail CPU pour ne pas saturer l'event loop", async () => {
    const configured = Number.parseInt(
      process.env.BACKGROUND_CPU_CONCURRENCY || "2",
      10,
    );
    const maxActive = await measurePeakConcurrency(runCpuBackgroundWork, 8);
    expect(maxActive).toBeLessThanOrEqual(
      Number.isFinite(configured) && configured > 0 ? configured : 2,
    );
  });
});
