import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    metadata: {
      findMany: vi.fn(async () => []),
    },
  },
}));

import { buildCachedBarcodePayload } from "@/lib/barcode/cachePayload";
import { BARCODE_CACHE_VERSION } from "@/lib/barcode/titleUtils";

function makeCachedRecord(shelfType: string) {
  return {
    id: 1,
    barcode: "8717418223908",
    provider: `AchatMoinsCher-${BARCODE_CACHE_VERSION}`,
    shelfType,
    mediaFormat: null,
    platformKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    priceLastUpdated: null,
    priceNew: null,
    priceUsed: null,
    priceUsedCIB: null,
    rawNames: [
      {
        id: 1,
        value: "Aladdin",
        coverUrl: "https://example.test/wrong-cover.jpg",
        barcodeCacheId: 1,
      },
    ],
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
});
