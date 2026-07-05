import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AxiosError } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  fetchICollectVideoGameItem: vi.fn(),
}));

vi.mock("./fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fetch")>();
  return {
    ...actual,
    fetchICollectVideoGameItem: h.fetchICollectVideoGameItem,
  };
});

import {
  ensureICollectIndex,
  rememberICollectBarcodeMappings,
  resetICollectIndexForTests,
  writeICollectIndexMeta,
} from "./indexStore";
import { runICollectPageScrapeBatch } from "./catalogSync";

describe("runICollectPageScrapeBatch", () => {
  let tempDir = "";

  beforeEach(() => {
    resetICollectIndexForTests();
    tempDir = mkdtempSync(path.join(tmpdir(), "icollect-sync-"));
    process.env.ICOLLECT_INDEX_PATH = path.join(tempDir, "videogames.sqlite");
    h.fetchICollectVideoGameItem.mockReset();
  });

  afterEach(() => {
    resetICollectIndexForTests();
    delete process.env.ICOLLECT_INDEX_PATH;
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it("backs off when the host rate-limits page fetches", async () => {
    const db = await ensureICollectIndex();
    expect(db).not.toBeNull();
    if (!db) return;

    rememberICollectBarcodeMappings(db, [
      {
        barcodeKey: "45496365226",
        rawBarcode: "045496365226",
        itemId: "892033",
        itemUrl: "https://www.icollecteverything.com/db/item/videogame/892033/",
      },
    ]);

    h.fetchICollectVideoGameItem.mockRejectedValue(
      new AxiosError("Too Many Requests", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 429,
        statusText: "Too Many Requests",
        headers: { "retry-after": "60" },
        config: {} as never,
        data: "",
      }),
    );

    const result = await runICollectPageScrapeBatch(db, {
      batchSize: 5,
      delayMs: 0,
      tickBudgetMs: 5_000,
    });

    expect(result.rateLimited).toBe(true);
    expect(result.backoffMs).toBe(60_000);
    expect(h.fetchICollectVideoGameItem).toHaveBeenCalledTimes(1);

    const second = await runICollectPageScrapeBatch(db, {
      batchSize: 5,
      delayMs: 0,
      tickBudgetMs: 5_000,
    });
    expect(second.rateLimited).toBe(true);
    expect(second.scraped).toBe(0);
    expect(h.fetchICollectVideoGameItem).toHaveBeenCalledTimes(1);
  });

  it("scrapes aggressively within a tick budget", async () => {
    const db = await ensureICollectIndex();
    expect(db).not.toBeNull();
    if (!db) return;

    rememberICollectBarcodeMappings(db, [
      {
        barcodeKey: "45496365226",
        rawBarcode: "045496365226",
        itemId: "892033",
        itemUrl: "https://www.icollecteverything.com/db/item/videogame/892033/",
      },
      {
        barcodeKey: "45496364649",
        rawBarcode: "0045496364649",
        itemId: "892034",
        itemUrl: "https://www.icollecteverything.com/db/item/videogame/892034/",
      },
    ]);

    h.fetchICollectVideoGameItem.mockResolvedValue({
      itemId: "892033",
      itemUrl: "https://www.icollecteverything.com/db/item/videogame/892033/",
      title: "Mario Kart Wii",
      catalogSource: "page",
    });

    writeICollectIndexMeta(db, "sync_page_backoff_until", "");

    const result = await runICollectPageScrapeBatch(db, {
      batchSize: 2,
      delayMs: 0,
      tickBudgetMs: 60_000,
    });

    expect(result.scraped).toBe(2);
    expect(result.rateLimited).toBe(false);
    expect(h.fetchICollectVideoGameItem).toHaveBeenCalledTimes(2);
  });

  it("scrapes with bounded concurrency", async () => {
    const db = await ensureICollectIndex();
    expect(db).not.toBeNull();
    if (!db) return;

    rememberICollectBarcodeMappings(db, [
      {
        barcodeKey: "45496365226",
        rawBarcode: "045496365226",
        itemId: "892033",
        itemUrl: "https://www.icollecteverything.com/db/item/videogame/892033/",
      },
      {
        barcodeKey: "45496364649",
        rawBarcode: "0045496364649",
        itemId: "892034",
        itemUrl: "https://www.icollecteverything.com/db/item/videogame/892034/",
      },
    ]);

    let inFlight = 0;
    let maxInFlight = 0;
    h.fetchICollectVideoGameItem.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 40));
      inFlight -= 1;
      return {
        itemId: "892033",
        itemUrl: "https://www.icollecteverything.com/db/item/videogame/892033/",
        title: "Mario Kart Wii",
        catalogSource: "page",
      };
    });

    writeICollectIndexMeta(db, "sync_page_backoff_until", "");

    const result = await runICollectPageScrapeBatch(db, {
      batchSize: 2,
      delayMs: 0,
      concurrency: 2,
      startGapMs: 0,
      tickBudgetMs: 60_000,
    });

    expect(result.scraped).toBe(2);
    expect(maxInFlight).toBe(2);
    expect(h.fetchICollectVideoGameItem).toHaveBeenCalledTimes(2);
  });
});
