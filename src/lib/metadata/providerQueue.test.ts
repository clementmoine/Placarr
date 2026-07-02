import { describe, expect, it } from "vitest";

import {
  resetMetadataProviderQueuesForTests,
  resolveMetadataProvidersInOrder,
  runQueuedMetadataProviderCall,
} from "@/lib/metadata/providerQueue";

describe("metadataProviderQueue", () => {
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
});
