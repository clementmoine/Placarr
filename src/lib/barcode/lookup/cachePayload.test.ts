import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    metadata: {
      findMany: vi.fn(async () => []),
    },
  },
}));

import {
  buildCachedBarcodePayload,
  cleanCompiledResultForResponse,
} from "@/lib/barcode/lookup/cachePayload";
import { BARCODE_CACHE_VERSION } from "@/lib/barcode/titleUtils";
import type { ResolvedMatch } from "@/lib/barcode/evidence";

function makeMatch(name: string, suggestions: string[] = []): ResolvedMatch {
  return {
    name,
    suggestions,
    coverUrl: null,
    confidence: 1,
    evidence: {} as ResolvedMatch["evidence"],
  };
}

function makeCachedRecord(
  shelfType: string,
  overrides: Partial<{
    cleanName: string | null;
    displayName: string | null;
    edition: string | null;
    rawNames: Array<{ value: string; coverUrl: string | null }>;
  }> = {},
) {
  return {
    id: 1,
    barcode: "8717418223908",
    provider: `AchatMoinsCher-${BARCODE_CACHE_VERSION}`,
    shelfType,
    mediaFormat: null,
    cleanName: overrides.cleanName ?? null,
    displayName: overrides.displayName ?? null,
    edition: overrides.edition ?? null,
    platformKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    priceLastUpdated: null,
    priceNew: null,
    priceUsed: null,
    priceUsedCIB: null,
    observations: null,
    observationSchemaVersion: null,
    rawNames: (
      overrides.rawNames ?? [
        { value: "Aladdin", coverUrl: "https://example.test/wrong-cover.jpg" },
      ]
    ).map((rn, index) => ({
      id: index + 1,
      value: rn.value,
      coverUrl: rn.coverUrl,
      barcodeCacheId: 1,
    })),
  };
}

describe("buildCachedBarcodePayload", () => {
  it("n'utilise pas la couverture brute d'un cache d'un autre type", async () => {
    const payload = await buildCachedBarcodePayload(
      makeCachedRecord("games"),
      "movies",
      "8717418223908",
    );

    expect(payload.matches[0]?.coverUrl).toBeNull();
  });

  it("conserve la couverture brute quand le type du cache correspond", async () => {
    const payload = await buildCachedBarcodePayload(
      makeCachedRecord("movies"),
      "movies",
      "8717418223908",
    );

    expect(payload.matches[0]?.coverUrl).toBe(
      "https://example.test/wrong-cover.jpg",
    );
  });

  it("réutilise le titre structuré stocké au lieu de re-dériver (Gottlieb Pinball Classics)", async () => {
    // Cached rawNames are stripped to "Gottlieb Pinball"; the stored structured
    // columns carry the consensus title and must win.
    const payload = await buildCachedBarcodePayload(
      makeCachedRecord("games", {
        cleanName: "Gottlieb Pinball Classics",
        displayName: "Gottlieb Pinball Classics",
        edition: null,
        rawNames: [{ value: "Gottlieb Pinball", coverUrl: null }],
      }),
      "games",
      "8717418223908",
    );

    expect(payload.cleanName).toBe("Gottlieb Pinball Classics");
    expect(payload.displayName).toBe("Gottlieb Pinball Classics");
    expect(payload.edition).toBeNull();
    expect(payload.matches[0]?.name).toBe("Gottlieb Pinball Classics");
  });

  it("réutilise l'édition structurée stockée (Ghost Recon 2 — Classics)", async () => {
    const payload = await buildCachedBarcodePayload(
      makeCachedRecord("games", {
        cleanName: "Tom Clancy's Ghost Recon 2",
        displayName: "Tom Clancy's Ghost Recon 2 — Classics",
        edition: "Classics",
        rawNames: [{ value: "Tom Clancy's Ghost Recon 2", coverUrl: null }],
      }),
      "games",
      "8717418223908",
    );

    expect(payload.cleanName).toBe("Tom Clancy's Ghost Recon 2");
    expect(payload.edition).toBe("Classics");
    expect(payload.displayName).toBe("Tom Clancy's Ghost Recon 2 — Classics");
    expect(payload.matches[0]?.name).toBe(
      "Tom Clancy's Ghost Recon 2 — Classics",
    );
  });

  it("reprojette le titre depuis les observations quand les colonnes structurées sont absentes", async () => {
    const payload = await buildCachedBarcodePayload(
      {
        ...makeCachedRecord("games", {
          rawNames: [{ value: "Gottlieb Pinball", coverUrl: null }],
        }),
        observations: [
          {
            kind: "title",
            role: "catalog_title",
            value: "Gottlieb Pinball Classics",
            provenance: {
              providerId: "philibert",
              providerLabel: "Philibert",
              sourceDocumentRole: "catalog_product",
              evidenceSignals: ["barcode_match"],
            },
            usage: {
              displayCandidate: true,
              searchAlias: "normal",
              evidence: "normal",
              retainForReprojection: true,
            },
          },
        ],
        observationSchemaVersion: "metadata-observations/v1",
      },
      "games",
      "8717418223908",
    );

    expect(payload.cleanName).toBe("Gottlieb Pinball Classics");
    expect(payload.displayName).toBe("Gottlieb Pinball Classics");
    expect(payload.matches[0]?.name).toBe("Gottlieb Pinball Classics");
  });

  it("reprojette la couverture depuis les observations image", async () => {
    const payload = await buildCachedBarcodePayload(
      {
        ...makeCachedRecord("movies"),
        observations: [
          {
            kind: "image",
            role: "cover_front",
            type: "cover",
            url: "https://example.test/obs-cover.jpg",
            provenance: {
              providerId: "tmdb",
              sourceDocumentRole: "reference_record",
              evidenceSignals: ["barcode_match"],
            },
            usage: {
              displayCandidate: true,
              searchAlias: "none",
              evidence: "strong",
              retainForReprojection: true,
            },
          },
        ],
        observationSchemaVersion: "metadata-observations/v1",
      },
      "movies",
      "8717418223908",
    );

    expect(payload.matches[0]?.coverUrl).toBe("https://example.test/obs-cover.jpg");
  });

  it("reprojette platformKey depuis les observations fact quand la colonne est absente", async () => {
    const payload = await buildCachedBarcodePayload(
      {
        ...makeCachedRecord("games", {
          rawNames: [{ value: "Mario Kart Wii", coverUrl: null }],
        }),
        platformKey: null,
        observations: [
          {
            kind: "fact",
            role: "structured_fact",
            factKind: "platform",
            label: "Plateforme",
            value: "wii",
            provenance: {
              providerId: "pricecharting",
              sourceDocumentRole: "reference_record",
              evidenceSignals: ["barcode_match"],
            },
            usage: {
              displayCandidate: false,
              searchAlias: "none",
              evidence: "strong",
              retainForReprojection: true,
            },
          },
        ],
        observationSchemaVersion: "metadata-observations/v1",
      },
      "games",
      "0045496365226",
    );

    expect(payload.platformKey).toBe("wii");
  });
});

describe("cleanCompiledResultForResponse", () => {
  it("garde un terme d'édition intégral au titre quand l'édition vaut null (Gottlieb Pinball Classics)", () => {
    // The consensus engine kept "Classics" as part of the title (edition: null).
    // The response layer must NOT re-strip it back to "Gottlieb Pinball".
    const result = cleanCompiledResultForResponse(
      {
        rawNames: ["Gottlieb Pinball Classics"],
        cleanName: "Gottlieb Pinball Classics",
        displayName: "Gottlieb Pinball Classics",
        edition: null,
        suggestions: ["Gottlieb Pinball Classics"],
        matches: [makeMatch("Gottlieb Pinball Classics")],
      },
      "games",
    );

    expect(result.cleanName).toBe("Gottlieb Pinball Classics");
    expect(result.displayName).toBe("Gottlieb Pinball Classics");
    expect(result.edition).toBeNull();
    expect(result.matches[0]?.name).toBe("Gottlieb Pinball Classics");
  });

  it("garde l'édition séparée du titre de base pour la recherche de métadonnées (Ghost Recon 2 — Classics)", () => {
    // A genuine budget edition: the base stays clean for lookup, the edition is
    // recorded and reassembled into the displayed title.
    const result = cleanCompiledResultForResponse(
      {
        rawNames: ["Tom Clancy's Ghost Recon 2 Classics"],
        cleanName: "Tom Clancy's Ghost Recon 2",
        displayName: "Tom Clancy's Ghost Recon 2 — Classics",
        edition: "Classics",
        suggestions: ["Tom Clancy's Ghost Recon 2 — Classics"],
        matches: [makeMatch("Tom Clancy's Ghost Recon 2 — Classics")],
      },
      "games",
    );

    expect(result.cleanName).toBe("Tom Clancy's Ghost Recon 2");
    expect(result.edition).toBe("Classics");
    expect(result.displayName).toBe("Tom Clancy's Ghost Recon 2 — Classics");
    expect(result.matches[0]?.name).toBe(
      "Tom Clancy's Ghost Recon 2 — Classics",
    );
  });
});
