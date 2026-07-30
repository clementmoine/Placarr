import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  peekPrintVariant,
  requestPrintVariant,
  resetPrintVariantStore,
  subscribeToPrintVariants,
} from "@/lib/client/printVariantStore";

type Call = { printKeys: string[]; type: string };

function recordFetch(answers: Record<string, unknown> = {}): { calls: Call[] } {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const params = new URL(url, "http://test").searchParams;
      calls.push({
        printKeys: (params.get("printKeys") ?? "").split(","),
        type: params.get("type") ?? "",
      });
      return {
        ok: true,
        json: async () => ({ candidates: answers }),
      };
    }),
  );
  return { calls };
}

/**
 * Let the scheduled batch go out and its response land. `advanceTimersByTimeAsync`
 * drains the microtask queue between timers, which is where the fetch and its
 * `json()` resolve.
 */
async function settle() {
  await vi.advanceTimersByTimeAsync(0);
}

describe("printVariantStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetPrintVariantStore();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("coalesces every card of one type into a single request", async () => {
    const { calls } = recordFetch();

    requestPrintVariant("lorcana:1-1", "tcg");
    requestPrintVariant("lorcana:1-2", "tcg");
    requestPrintVariant("lorcana:1-3", "tcg");
    await settle();

    expect(calls).toHaveLength(1);
    expect(calls[0].printKeys).toEqual([
      "lorcana:1-1",
      "lorcana:1-2",
      "lorcana:1-3",
    ]);
  });

  it("splits media types apart, since the type picks the providers", async () => {
    const { calls } = recordFetch();

    requestPrintVariant("lorcana:1-1", "tcg");
    requestPrintVariant("asterix:1", "books");
    await settle();

    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.type).sort()).toEqual(["books", "tcg"]);
  });

  it("chunks below the ceiling the API silently truncates at", async () => {
    const { calls } = recordFetch();

    for (let index = 0; index < 130; index += 1) {
      requestPrintVariant(`lorcana:1-${index}`, "tcg");
    }
    await settle();

    expect(calls).toHaveLength(2);
    expect(calls[0].printKeys).toHaveLength(120);
    expect(calls[1].printKeys).toHaveLength(10);
  });

  it("hands back what came, keyed by print", async () => {
    recordFetch({ "lorcana:1-1": { finishes: ["Silver"] } });

    requestPrintVariant("lorcana:1-1", "tcg");
    await settle();

    expect(peekPrintVariant("lorcana:1-1", "tcg")).toEqual({
      finishes: ["Silver"],
    });
  });

  it("keeps the same print apart across types", async () => {
    recordFetch({ "shared:1": { finishes: ["Silver"] } });

    requestPrintVariant("shared:1", "tcg");
    await settle();

    expect(peekPrintVariant("shared:1", "tcg")).not.toBeNull();
    // Never asked for as a book, so nothing is claimed about it as one.
    expect(peekPrintVariant("shared:1", "books")).toBeNull();
  });

  it("asks once, then serves the answer from memory", async () => {
    const { calls } = recordFetch({ "lorcana:1-1": { finishes: ["Silver"] } });

    requestPrintVariant("lorcana:1-1", "tcg");
    await settle();
    requestPrintVariant("lorcana:1-1", "tcg");
    await settle();

    expect(calls).toHaveLength(1);
  });

  it("does not re-ask for a print that came back unknown", async () => {
    const { calls } = recordFetch({});

    requestPrintVariant("lorcana:9-9", "tcg");
    await settle();
    expect(peekPrintVariant("lorcana:9-9", "tcg")).toBeNull();

    requestPrintVariant("lorcana:9-9", "tcg");
    await settle();

    expect(calls).toHaveLength(1);
  });

  it("asks nothing for a copy with no print key or no type", async () => {
    const { calls } = recordFetch();

    requestPrintVariant(null, "tcg");
    requestPrintVariant("", "tcg");
    requestPrintVariant("lorcana:1-1", null);
    await settle();

    expect(calls).toHaveLength(0);
    expect(peekPrintVariant(null, "tcg")).toBeNull();
  });

  it("tells subscribers when an answer lands", async () => {
    recordFetch({ "lorcana:1-1": { finishes: ["Silver"] } });
    const listener = vi.fn();
    subscribeToPrintVariants(listener);

    requestPrintVariant("lorcana:1-1", "tcg");
    await settle();

    expect(listener).toHaveBeenCalled();
  });

  it("survives a failing request without wedging", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );

    requestPrintVariant("lorcana:1-1", "tcg");
    await settle();

    expect(peekPrintVariant("lorcana:1-1", "tcg")).toBeNull();
  });
});
