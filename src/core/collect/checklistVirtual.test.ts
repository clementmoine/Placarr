import { describe, expect, it } from "vitest";

import { checklistSetOwnedKey } from "./checklist";
import {
  virtualChecklistKeys,
  virtualPrintKeysFromSealedItems,
} from "./checklistVirtual";
import type { VirtualProductView } from "./sealedLifecycle";

function product(
  over: Partial<VirtualProductView> & Pick<VirtualProductView, "skuKey">,
): VirtualProductView {
  return {
    contentsKnown: true,
    printsArePreview: false,
    guaranteedPrints: [{ printKey: "game:1" }, { printKey: "game:2" }],
    ...over,
  };
}

describe("virtualPrintKeysFromSealedItems", () => {
  it("derives printKeys from closed owned sealed with known contents", () => {
    const keys = virtualPrintKeysFromSealedItems(
      [
        {
          kind: "sealed",
          skuKey: "pack::starter",
          presence: "owned",
          openedAt: null,
        },
        {
          kind: "sealed",
          skuKey: "pack::opened",
          presence: "owned",
          openedAt: new Date("2026-01-01"),
        },
        { kind: "card", skuKey: null, presence: "owned" },
      ],
      (sku) =>
        sku === "pack::starter"
          ? product({ skuKey: sku })
          : product({
              skuKey: sku,
              guaranteedPrints: [{ printKey: "game:ghost" }],
            }),
    );
    expect([...keys].sort()).toEqual(["game:1", "game:2"]);
  });

  it("includes away sealed and skips unknown / preview catalogues", () => {
    const keys = virtualPrintKeysFromSealedItems(
      [
        {
          kind: "sealed",
          skuKey: "pack::away",
          presence: "away",
          openedAt: null,
        },
        {
          kind: "sealed",
          skuKey: "pack::unknown",
          presence: "owned",
          openedAt: null,
        },
      ],
      (sku) => {
        if (sku === "pack::away") return product({ skuKey: sku });
        if (sku === "pack::unknown") {
          return product({
            skuKey: sku,
            contentsKnown: false,
            guaranteedPrints: [{ printKey: "game:nope" }],
          });
        }
        return null;
      },
    );
    expect([...keys].sort()).toEqual(["game:1", "game:2"]);
  });
});

describe("virtualChecklistKeys", () => {
  it("always includes the bare printKey; master set uses blank finish", () => {
    const plain = virtualChecklistKeys(["Game:Z"], { masterSet: false });
    expect(plain.has("game:z")).toBe(true);
    const master = virtualChecklistKeys(["Game:Z"], { masterSet: true });
    expect(master.has("game:z|")).toBe(true);
    expect(master.has(checklistSetOwnedKey(null, "game:z", null))).toBe(true);
  });
});
