import { describe, expect, it, vi, afterEach } from "vitest";

import {
  ITEM_ENRICH_WINDOW_MS,
  METADATA_REFRESH_MAX_MS,
  isItemEnriching,
  isItemMetadataBusy,
  isItemMetadataRefreshing,
} from "./enrichment";

describe("isItemEnriching", () => {
  it("returns true for a recent item without metadata", () => {
    expect(
      isItemEnriching({ metadataId: null, createdAt: new Date() }),
    ).toBe(true);
  });

  it("returns false once metadata is linked", () => {
    expect(
      isItemEnriching({ metadataId: "m1", createdAt: new Date() }),
    ).toBe(false);
  });

  it("returns false after the enrich window expires", () => {
    const old = new Date(Date.now() - ITEM_ENRICH_WINDOW_MS - 1);
    expect(isItemEnriching({ metadataId: null, createdAt: old })).toBe(false);
  });
});

describe("isItemMetadataRefreshing", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true while metadataRefreshStartedAt is recent", () => {
    expect(
      isItemMetadataRefreshing({
        metadataRefreshStartedAt: new Date().toISOString(),
      }),
    ).toBe(true);
  });

  it("returns false once the refresh window expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-27T12:00:00.000Z"));
    const startedAt = new Date(
      Date.now() - METADATA_REFRESH_MAX_MS - 1,
    ).toISOString();
    expect(
      isItemMetadataRefreshing({ metadataRefreshStartedAt: startedAt }),
    ).toBe(false);
  });
});

describe("isItemMetadataBusy", () => {
  it("is true while enriching or refreshing", () => {
    expect(
      isItemMetadataBusy({ metadataId: null, createdAt: new Date() }),
    ).toBe(true);
    expect(
      isItemMetadataBusy({
        metadataId: "m1",
        metadataRefreshStartedAt: new Date().toISOString(),
      }),
    ).toBe(true);
    expect(
      isItemMetadataBusy({
        metadataId: "m1",
        createdAt: new Date(Date.now() - ITEM_ENRICH_WINDOW_MS - 1),
      }),
    ).toBe(false);
  });
});
