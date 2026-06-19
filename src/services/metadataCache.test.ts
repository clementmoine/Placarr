import { describe, it, expect, vi, beforeEach } from "vitest";

import type { MetadataResult } from "@/types/metadataProvider";

// Keep the module light + deterministic: stub the provider fan-out and the
// storage/db layers that metadata.ts imports at module load.
const h = vi.hoisted(() => {
  let calls = 0;
  const fetchMetadataByType = vi.fn(
    async (name: string): Promise<MetadataResult | null> =>
      name.startsWith("MISS")
        ? null
        : ({ title: `${name} #${++calls}` } as MetadataResult),
  );
  return { fetchMetadataByType };
});
const fetchMetadataByType = h.fetchMetadataByType;

vi.mock("@/services/metadataFetch", () => ({
  fetchMetadataByType: h.fetchMetadataByType,
}));
vi.mock("@/services/metadataStorage", () => ({
  formatMetadataFromStorage: vi.fn(),
  getCachedMetadata: vi.fn(),
  storeMetadata: vi.fn(),
  formatMetadataForStorage: vi.fn(),
  downloadRemoteImage: vi.fn(),
  readAttachmentImageMetrics: vi.fn(),
}));
vi.mock("@/services/metadataDatabase", () => ({
  confrontWithDatabase: vi.fn(),
  getDatabaseSuggestions: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { getMetadata } from "@/services/metadata";

beforeEach(() => {
  fetchMetadataByType.mockClear();
});

describe("getMetadata — short-lived lookup cache", () => {
  it("coalesces identical lookups into a single provider fetch", async () => {
    const a = await getMetadata("Sith Game A", "games", "111", "xbox");
    const b = await getMetadata("Sith Game A", "games", "111", "xbox");

    expect(fetchMetadataByType).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b); // same chosen result reused everywhere
  });

  it("dedupes concurrent in-flight lookups", async () => {
    const [a, b] = await Promise.all([
      getMetadata("Sith Game B", "games", "222", "xbox"),
      getMetadata("Sith Game B", "games", "222", "xbox"),
    ]);

    expect(fetchMetadataByType).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it("bypasses the cache for explicit refreshes", async () => {
    await getMetadata("Sith Game C", "games", "333", "xbox");
    await getMetadata("Sith Game C", "games", "333", "xbox", {
      bypassCache: true,
    });

    expect(fetchMetadataByType).toHaveBeenCalledTimes(2);
  });

  it("keys on type/name/barcode/platform", async () => {
    await getMetadata("Sith Game D", "games", "444", "xbox");
    await getMetadata("Sith Game D", "games", "444", "ps2");

    expect(fetchMetadataByType).toHaveBeenCalledTimes(2);
  });

  it("does not cache empty results (retries transient misses)", async () => {
    const first = await getMetadata("MISS Game E", "games", "555", "xbox");
    const second = await getMetadata("MISS Game E", "games", "555", "xbox");

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(fetchMetadataByType).toHaveBeenCalledTimes(2);
  });
});
