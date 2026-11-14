import { describe, expect, it } from "vitest";

import {
  sealedPrintCopyCount,
  sealedPrintQty,
} from "@/components/admin/CatalogueSealedPrintGrid";
import type { SealedPrintLink } from "@/providers/shared/sealedProducts/indexFormat";

function link(
  partial: Partial<SealedPrintLink> & { printKey: string },
): SealedPrintLink {
  return {
    name: partial.printKey,
    slug: partial.printKey,
    ref: null,
    ...partial,
  };
}

describe("sealedPrintQty / sealedPrintCopyCount", () => {
  it("defaults missing qty to 1 and sums copies for the checklist caption", () => {
    const prints = [
      link({ printKey: "naruto:cl-0007" }),
      link({ printKey: "naruto:ni-0076", qty: 2 }),
      link({ printKey: "naruto:ni-0084", qty: 1, finish: "holo" }),
    ];
    expect(sealedPrintQty(prints[0]!)).toBe(1);
    expect(sealedPrintQty(prints[1]!)).toBe(2);
    expect(sealedPrintCopyCount(prints)).toBe(4);
  });
});
