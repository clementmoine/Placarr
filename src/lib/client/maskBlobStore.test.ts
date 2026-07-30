import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  peekMaskBlob,
  requestMaskBlob,
  resetMaskBlobStore,
  subscribeToMaskBlobs,
} from "@/lib/client/maskBlobStore";

const MASK = "/uploads/aaa.jpg";
const OTHER = "/uploads/bbb.png";

function stubObjectUrls() {
  let next = 0;
  const created: unknown[] = [];
  const revoked: string[] = [];
  vi.stubGlobal("URL", {
    createObjectURL: (blob: unknown) => {
      created.push(blob);
      next += 1;
      return `blob:test/${next}`;
    },
    revokeObjectURL: (url: string) => revoked.push(url),
  });
  return { created, revoked };
}

function stubFetch(ok = true) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      return { ok, blob: async () => ({ size: 1, type: "image/jpeg" }) };
    }),
  );
  return calls;
}

/** Let the fetch and its `blob()` resolve. */
async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("maskBlobStore", () => {
  beforeEach(() => {
    resetMaskBlobStore();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("has nothing before the file is in memory", () => {
    stubObjectUrls();
    stubFetch();

    // The caller must draw no masked layer on this: an unresolved mask is an
    // unmasked one covering the whole card.
    expect(peekMaskBlob(MASK)).toBeNull();
  });

  it("hands back an object URL once the bytes have arrived", async () => {
    stubObjectUrls();
    stubFetch();

    requestMaskBlob(MASK);
    await settle();

    expect(peekMaskBlob(MASK)).toMatch(/^blob:/);
  });

  it("fetches one file once, however many cards share it", async () => {
    stubObjectUrls();
    const calls = stubFetch();

    requestMaskBlob(MASK);
    requestMaskBlob(MASK);
    await settle();
    requestMaskBlob(MASK);
    await settle();

    expect(calls).toEqual([MASK]);
  });

  it("makes one blob per file, not per card", async () => {
    const { created } = stubObjectUrls();
    stubFetch();

    requestMaskBlob(MASK);
    requestMaskBlob(MASK);
    requestMaskBlob(OTHER);
    await settle();

    expect(created).toHaveLength(2);
  });

  it("keeps files apart", async () => {
    stubObjectUrls();
    stubFetch();

    requestMaskBlob(MASK);
    requestMaskBlob(OTHER);
    await settle();

    expect(peekMaskBlob(MASK)).not.toBe(peekMaskBlob(OTHER));
  });

  it("asks nothing for a card with no mask", async () => {
    stubObjectUrls();
    const calls = stubFetch();

    requestMaskBlob(null);
    requestMaskBlob(undefined);
    requestMaskBlob("");
    await settle();

    expect(calls).toEqual([]);
    expect(peekMaskBlob(null)).toBeNull();
  });

  it("leaves the card plain when the file cannot be fetched", async () => {
    stubObjectUrls();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );

    requestMaskBlob(MASK);
    await settle();

    expect(peekMaskBlob(MASK)).toBeNull();
  });

  it("leaves the card plain on a non-ok response", async () => {
    stubObjectUrls();
    stubFetch(false);

    requestMaskBlob(MASK);
    await settle();

    expect(peekMaskBlob(MASK)).toBeNull();
  });

  it("lets a failed fetch be retried rather than wedging", async () => {
    stubObjectUrls();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    requestMaskBlob(MASK);
    await settle();

    const calls = stubFetch();
    requestMaskBlob(MASK);
    await settle();

    expect(calls).toEqual([MASK]);
    expect(peekMaskBlob(MASK)).toMatch(/^blob:/);
  });

  it("tells subscribers when a mask becomes wearable", async () => {
    stubObjectUrls();
    stubFetch();
    const listener = vi.fn();
    subscribeToMaskBlobs(listener);

    requestMaskBlob(MASK);
    await settle();

    expect(listener).toHaveBeenCalled();
  });

  it("stops telling a subscriber that unsubscribed", async () => {
    stubObjectUrls();
    stubFetch();
    const listener = vi.fn();
    subscribeToMaskBlobs(listener)();

    requestMaskBlob(MASK);
    await settle();

    expect(listener).not.toHaveBeenCalled();
  });
});
