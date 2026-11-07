import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  hydrateScanLock,
  prefillFromHydrated,
} from "@/lib/client/scan/hydrateScanLock";
import type { HydratedScanLock } from "@/lib/client/scan/hydrateScanLock";
import { getMetadataPreview } from "@/lib/api/metadata";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(async () => ({ data: [] })),
  },
}));

vi.mock("@/lib/api/metadata", () => ({
  getMetadataPreview: vi.fn(async () => null),
}));

function base(partial: Partial<HydratedScanLock> = {}): HydratedScanLock {
  return {
    lockId: "card:pk:1",
    kind: "card",
    key: "narutoranks:nr-001",
    title: "Gaï",
    imageUrl: "/face.webp",
    language: "fr",
    packId: "naruto/ninja-ranks",
    shelfType: "tcg",
    suggestedShelfId: "ranks",
    shelfSure: true,
    owned: null,
    hits: [
      {
        title: "Gaï",
        imageUrl: "/face.webp",
        imageSource: "face",
        metadataPreview: null,
      },
    ],
    selectedHitIndex: 0,
    status: "ready",
    metadataPreview: null,
    ...partial,
  };
}

describe("hydrateScanLock manual", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the typed title for manual:timestamp keys (not Objet + digits)", async () => {
    const hydrated = await hydrateScanLock(
      {
        id: "manual:1",
        kind: "manual",
        key: "manual:1794070479699",
        label: "Mario 64",
        note: "Mario 64",
        faceUrl: null,
        lockedAt: Date.now(),
      },
      { shelves: [] },
    );
    expect(hydrated.title).toBe("Mario 64");
    expect(hydrated.status).toBe("ready");
    expect(hydrated.imageUrl).toBeNull();
    expect(getMetadataPreview).not.toHaveBeenCalled();
  });

  it("fetches a cover from metadata when a shelf type is known", async () => {
    vi.mocked(getMetadataPreview).mockResolvedValueOnce({
      title: "Super Mario 64",
      imageUrl: "https://cdn.example/mario64.jpg",
      attachments: [],
    } as never);

    const hydrated = await hydrateScanLock(
      {
        id: "manual:2",
        kind: "manual",
        key: "manual:100",
        label: "Mario 64",
        note: "Mario 64",
        faceUrl: null,
        lockedAt: Date.now(),
      },
      {
        shelves: [{ id: "n64", name: "Nintendo 64", type: "games" }],
        preferredShelfId: "n64",
      },
    );

    expect(getMetadataPreview).toHaveBeenCalledWith(
      "Mario 64",
      "games",
      null,
      null,
      "Nintendo 64",
    );
    expect(hydrated.title).toBe("Super Mario 64");
    expect(hydrated.imageUrl).toBe("https://cdn.example/mario64.jpg");
    expect(hydrated.shelfType).toBe("games");
    expect(hydrated.status).toBe("ready");
  });
});

describe("prefillFromHydrated", () => {
  it("maps a card lock to ItemModal printKey prefill", () => {
    expect(prefillFromHydrated(base())).toMatchObject({
      name: "Gaï",
      printKey: "narutoranks:nr-001",
      barcode: "",
      shelfId: "ranks",
      language: "fr",
      shelfType: "tcg",
      shelfSure: true,
    });
  });

  it("maps a barcode lock without printKey", () => {
    expect(
      prefillFromHydrated(
        base({
          lockId: "barcode:1",
          kind: "barcode",
          key: "045496590042",
          title: "Ryse",
          shelfType: "games",
          suggestedShelfId: "xbox",
          hits: [
            {
              title: "Ryse",
              imageUrl: null,
              imageSource: "none",
              metadataPreview: null,
            },
          ],
        }),
      ),
    ).toMatchObject({
      name: "Ryse",
      barcode: "045496590042",
      printKey: null,
      shelfId: "xbox",
    });
  });
});
