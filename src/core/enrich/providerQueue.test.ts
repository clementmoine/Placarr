import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  API_PROVIDER_CONCURRENCY,
  configureProviderQueue,
  providerQueueSettings,
  PROVIDER_RESOLVE_TIMEOUT_INTERACTIVE_MS,
  resetMetadataProviderQueuesForTests,
  resolveMetadataProvidersInOrder,
  runQueuedMetadataProviderCall,
  STAGE_RESOLVE_CONCURRENCY_BACKGROUND,
} from "@/core/enrich/providerQueue";
import { resetProviderRuntimeStatsForTests } from "@/core/enrich/providerRuntimeStats";

describe("metadataProviderQueue", () => {
  beforeEach(() => {
    resetMetadataProviderQueuesForTests();
    resetProviderRuntimeStatsForTests();
  });
  it("serializes calls for the same provider", async () => {
    resetMetadataProviderQueuesForTests();
    const order: number[] = [];

    const first = runQueuedMetadataProviderCall("screenscraper", async () => {
      order.push(1);
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push(2);
      return "first";
    });
    const second = runQueuedMetadataProviderCall("screenscraper", async () => {
      order.push(3);
      return "second";
    });

    await Promise.all([first, second]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("allows different providers to run independently", async () => {
    resetMetadataProviderQueuesForTests();
    let igdbStarted = false;
    let ssFinished = false;

    const ss = runQueuedMetadataProviderCall("screenscraper", async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      ssFinished = true;
      return "ss";
    });
    const igdb = runQueuedMetadataProviderCall("igdb", async () => {
      igdbStarted = true;
      expect(ssFinished).toBe(false);
      return "igdb";
    });

    await Promise.all([ss, igdb]);
    expect(igdbStarted).toBe(true);
    expect(ssFinished).toBe(true);
  });

  it("prioritizes interactive provider calls over background ones", async () => {
    resetMetadataProviderQueuesForTests();
    const order: string[] = [];

    const blocking = runQueuedMetadataProviderCall(
      "screenscraper",
      async () => {
        order.push("block-start");
        await new Promise((resolve) => setTimeout(resolve, 30));
        order.push("block-end");
        return "block";
      },
      "normal",
    );

    const normal = runQueuedMetadataProviderCall(
      "screenscraper",
      async () => {
        order.push("normal");
        return "normal";
      },
      "normal",
    );

    await new Promise((resolve) => setTimeout(resolve, 5));

    const interactive = runQueuedMetadataProviderCall(
      "screenscraper",
      async () => {
        order.push("high");
        return "interactive";
      },
      "high",
    );

    await Promise.all([blocking, normal, interactive]);
    expect(order).toEqual(["block-start", "block-end", "high", "normal"]);
  });

  it("resolves selected providers concurrently while preserving result order", async () => {
    const started: string[] = [];
    let fastFinished = false;
    const adapters = new Map([
      [
        "slow",
        {
          id: "slow",
          resolve: async () => {
            started.push("slow");
            await new Promise((resolve) => setTimeout(resolve, 30));
            expect(fastFinished).toBe(true);
            return { title: "slow" };
          },
        },
      ],
      [
        "fast",
        {
          id: "fast",
          resolve: async () => {
            started.push("fast");
            fastFinished = true;
            return { title: "fast" };
          },
        },
      ],
    ]);

    const byProvider = await resolveMetadataProvidersInOrder(
      ["slow", "fast"],
      { name: "Test" },
      adapters,
    );

    expect(started).toEqual(["slow", "fast"]);
    expect(Array.from(byProvider.keys())).toEqual(["slow", "fast"]);
    expect(byProvider.get("fast")?.title).toBe("fast");
  });

  it("caps background stage fan-out so scrapes do not all start at once", async () => {
    let active = 0;
    let peak = 0;
    const adapters = new Map(
      ["a", "b", "c", "d", "e", "f"].map((id) => [
        id,
        {
          id,
          resolve: async () => {
            active++;
            peak = Math.max(peak, active);
            await new Promise((resolve) => setTimeout(resolve, 20));
            active--;
            return { title: id };
          },
        },
      ]),
    );

    await resolveMetadataProvidersInOrder(
      ["a", "b", "c", "d", "e", "f"],
      { name: "Test", isBackground: true },
      adapters,
    );

    expect(peak).toBeLessThanOrEqual(STAGE_RESOLVE_CONCURRENCY_BACKGROUND);
  });

  it("returns null when a provider exceeds the soft timeout without aborting the stage", async () => {
    vi.useFakeTimers();
    try {
      const adapters = new Map([
        [
          "slow",
          {
            id: "slow",
            resolve: async (ctx: { signal?: AbortSignal }) => {
              await new Promise<void>((_resolve, reject) => {
                ctx.signal?.addEventListener(
                  "abort",
                  () => {
                    reject(new DOMException("Aborted", "AbortError"));
                  },
                  { once: true },
                );
              });
              return { title: "slow" };
            },
          },
        ],
        [
          "fast",
          {
            id: "fast",
            resolve: async () => ({ title: "fast" }),
          },
        ],
      ]);

      // Interactive path avoids setImmediate yields that fake timers do not flush.
      const pending = resolveMetadataProvidersInOrder(
        ["slow", "fast"],
        { name: "Test", isBackground: false },
        adapters,
      );
      await vi.advanceTimersByTimeAsync(
        PROVIDER_RESOLVE_TIMEOUT_INTERACTIVE_MS,
      );
      const byProvider = await pending;
      expect(byProvider.get("slow")).toBeNull();
      expect(byProvider.get("fast")?.title).toBe("fast");
    } finally {
      vi.useRealTimers();
    }
  });

  it("invokes onProviderResult as each provider finishes without skipping the rest", async () => {
    resetMetadataProviderQueuesForTests();
    const seen: string[] = [];
    const adapters = new Map(
      ["a", "b", "c"].map((id) => [
        id,
        {
          id,
          resolve: async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            return { title: id };
          },
        },
      ]),
    );

    const byProvider = await resolveMetadataProvidersInOrder(
      ["a", "b", "c"],
      { name: "Test", isBackground: false },
      adapters,
      {
        onProviderResult: ({ providerId, result }) => {
          seen.push(providerId);
          expect(result?.title).toBe(providerId);
        },
      },
    );

    expect(seen.sort()).toEqual(["a", "b", "c"]);
    expect(Array.from(byProvider.keys())).toEqual(["a", "b", "c"]);
  });
});

describe("providerQueueSettings", () => {
  it("keeps scrapes serial", () => {
    expect(providerQueueSettings({ auth: { kind: "scrape" } })).toEqual({
      concurrency: 1,
      minIntervalMs: 0,
    });
  });

  it("keeps a declared interval serial and carries it", () => {
    expect(
      providerQueueSettings({
        auth: { kind: "key", env: ["IGDB"], free: true },
        minRequestIntervalMs: 250,
      }),
    ).toEqual({ concurrency: 1, minIntervalMs: 250 });
  });

  it("keeps rate-limited providers serial even without an interval", () => {
    expect(
      providerQueueSettings({
        auth: { kind: "none" },
        rateLimited: true,
      }),
    ).toEqual({ concurrency: 1, minIntervalMs: 0 });
  });

  it("lets an unthrottled API provider run in parallel", () => {
    expect(providerQueueSettings({ auth: { kind: "none" } })).toEqual({
      concurrency: API_PROVIDER_CONCURRENCY,
      minIntervalMs: 0,
    });
  });

  it("honours an explicit ceiling", () => {
    expect(
      providerQueueSettings({
        auth: { kind: "scrape" },
        maxConcurrentRequests: 2,
      }),
    ).toEqual({ concurrency: 2, minIntervalMs: 0 });
  });
});

describe("configureProviderQueue", () => {
  it("runs configured API calls in parallel and scrapes one at a time", async () => {
    resetMetadataProviderQueuesForTests();
    configureProviderQueue("parallel-api", { auth: { kind: "none" } });
    configureProviderQueue("serial-scrape", { auth: { kind: "scrape" } });

    const peaks = { api: 0, scrape: 0 };
    const active = { api: 0, scrape: 0 };
    const call = (id: "parallel-api" | "serial-scrape") => {
      const key = id === "parallel-api" ? "api" : "scrape";
      return runQueuedMetadataProviderCall(id, async () => {
        active[key] += 1;
        peaks[key] = Math.max(peaks[key], active[key]);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active[key] -= 1;
      });
    };

    await Promise.all([
      call("parallel-api"),
      call("parallel-api"),
      call("parallel-api"),
      call("serial-scrape"),
      call("serial-scrape"),
    ]);

    expect(peaks.api).toBe(3);
    expect(peaks.scrape).toBe(1);
  });
});
