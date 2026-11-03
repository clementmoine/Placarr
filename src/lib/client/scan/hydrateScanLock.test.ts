import { describe, expect, it } from "vitest";

import { prefillFromHydrated } from "@/lib/client/scan/hydrateScanLock";
import type { HydratedScanLock } from "@/lib/client/scan/hydrateScanLock";

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
