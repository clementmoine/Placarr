import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MetadataResult } from "@/types/metadataProvider";

const h = vi.hoisted(() => ({
  fetchMetadataByType: vi.fn(),
  getCachedMetadata: vi.fn(),
  storeMetadata: vi.fn(),
  formatMetadataFromStorage: vi.fn((value: unknown) => value as MetadataResult),
  assertRefreshCanPersist: vi.fn().mockResolvedValue(true),
  prismaItemFindUnique: vi.fn(),
  prismaFieldEvidenceFindMany: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/core/enrich/fetch", () => ({
  fetchMetadataByType: h.fetchMetadataByType,
}));

vi.mock("@/core/enrich/storage", () => ({
  formatMetadataFromStorage: h.formatMetadataFromStorage,
  getCachedMetadata: h.getCachedMetadata,
  storeMetadata: h.storeMetadata,
  formatMetadataForStorage: vi.fn(),
  downloadRemoteImage: vi.fn(),
  readAttachmentImageMetrics: vi.fn(),
}));

vi.mock("@/core/enrich/database", () => ({
  confrontWithDatabase: vi.fn(),
  getDatabaseSuggestions: vi.fn(),
}));

vi.mock("@/core/collect/jobs/metadataRefreshSession", () => ({
  assertRefreshCanPersist: h.assertRefreshCanPersist,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    item: { findUnique: h.prismaItemFindUnique },
    fieldEvidence: { findMany: h.prismaFieldEvidenceFindMany },
  },
}));

import { fetchAndStoreMetadata } from "@/core/enrich";

describe("fetchAndStoreMetadata — progressive API pass", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.assertRefreshCanPersist.mockResolvedValue(true);
    h.getCachedMetadata.mockResolvedValue(null);
    h.prismaItemFindUnique.mockResolvedValue({
      metadata: {
        id: "meta-1",
        facts: JSON.stringify([
          {
            kind: "external-link",
            source: "bdovore",
            label: "BDovore",
            value: "Voir la fiche",
            url: "https://www.bdovore.com/Album?id_tome=51068",
          },
        ]),
        attachments: [
          {
            source: "bdovore",
            url: "https://www.bdovore.com/images/couv/CV-051068-050605.jpg",
          },
        ],
      },
      fieldEvidence: [],
    });
    h.prismaFieldEvidenceFindMany.mockResolvedValue([]);
    h.storeMetadata.mockImplementation(
      async (_itemId: string, metadata: MetadataResult) => metadata,
    );
  });

  it("stores the API-pass snapshot via onApiPassComplete before the final merge", async () => {
    const stores: string[] = [];
    h.storeMetadata.mockImplementation(
      async (_itemId: string, metadata: MetadataResult) => {
        stores.push(metadata.title ?? "");
        return metadata;
      },
    );

    h.fetchMetadataByType.mockImplementation(
      async (
        _name: string,
        _type: string,
        _barcode: string | null | undefined,
        _platform: string | null | undefined,
        options?: {
          onApiPassComplete?: (partial: MetadataResult) => Promise<void>;
          existingScrapeProviderIds?: readonly string[];
          existingExternalIds?: Record<string, string | null>;
          existingProviderRecordUrls?: Record<string, string>;
        },
      ) => {
        expect([...(options?.existingScrapeProviderIds ?? [])].sort()).toEqual([
          "bdovore",
        ]);
        expect(options?.existingExternalIds).toEqual({ bdovore: "51068" });
        expect(options?.existingProviderRecordUrls).toEqual({
          bdovore: "https://www.bdovore.com/Album?id_tome=51068",
        });
        await options?.onApiPassComplete?.({
          title: "API partial",
          imageUrl: "https://covers.example/a.jpg",
          description: "from openlibrary",
        });
        return {
          title: "Final merge",
          imageUrl: "https://covers.example/b.jpg",
          description: "from bedetheque",
        };
      },
    );

    const result = await fetchAndStoreMetadata(
      "item-1",
      "Wakfu Tome 3",
      "books",
      "9782331045678",
      true,
      null,
      true,
      true,
      "Mangas",
    );

    expect(stores).toEqual(["API partial", "Final merge"]);
    expect(result?.title).toBe("Final merge");
    expect(h.storeMetadata).toHaveBeenCalledTimes(2);
    expect(h.storeMetadata.mock.calls[0][4]).toMatchObject({
      deferImageLocalization: true,
      skipDeferredLocalizationSchedule: true,
    });
    expect(h.storeMetadata.mock.calls[1][4]).toMatchObject({
      deferImageLocalization: true,
    });
    expect(
      h.storeMetadata.mock.calls[1][4]?.skipDeferredLocalizationSchedule,
    ).toBeFalsy();
  });

  it("keeps the progressive snapshot when the final fetch aborts", async () => {
    h.fetchMetadataByType.mockImplementation(
      async (
        _name: string,
        _type: string,
        _barcode: string | null | undefined,
        _platform: string | null | undefined,
        options?: {
          onApiPassComplete?: (partial: MetadataResult) => Promise<void>;
        },
      ) => {
        await options?.onApiPassComplete?.({
          title: "API partial",
          imageUrl: "https://covers.example/a.jpg",
        });
        const error = new Error("Aborted");
        error.name = "AbortError";
        throw error;
      },
    );
    h.getCachedMetadata.mockResolvedValue({
      title: "API partial",
      imageUrl: "https://covers.example/a.jpg",
      attachments: [],
    });

    const result = await fetchAndStoreMetadata(
      "item-1",
      "Wakfu Tome 3",
      "books",
      null,
      true,
      null,
      true,
      true,
    );

    expect(h.storeMetadata).toHaveBeenCalledTimes(1);
    expect(result?.title).toBe("API partial");
  });
});
