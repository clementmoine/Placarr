import { describe, expect, it } from "vitest";

import { parsePriceCents } from "@/core/collect/itemAbsence";
import {
  bulkLifecyclePatchFromDirty,
  bulkLifecyclePatchIsEmpty,
  commonBulkLifecycleForm,
} from "@/lib/client/bulkLifecycleForm";

describe("commonBulkLifecycleForm", () => {
  it("prefills shared presence / reason", () => {
    const form = commonBulkLifecycleForm([
      {
        presence: "away",
        absenceReason: "ordered",
        absenceSource: "Cardmarket",
      },
      {
        presence: "away",
        absenceReason: "ordered",
        absenceSource: "Cardmarket",
      },
    ]);
    expect(form.presence).toBe("away");
    expect(form.absenceReason).toBe("ordered");
    expect(form.absenceSource).toBe("Cardmarket");
  });

  it("leaves mixed fields empty", () => {
    const form = commonBulkLifecycleForm([
      { presence: "away", absenceReason: "ordered", absenceSource: "A" },
      { presence: "owned", absenceReason: null, absenceSource: "B" },
    ]);
    expect(form.presence).toBe("");
    expect(form.absenceReason).toBe("");
    expect(form.absenceSource).toBe("");
  });

  it("does not default to ordered", () => {
    const form = commonBulkLifecycleForm([
      { presence: "owned" },
      { presence: "owned" },
    ]);
    expect(form.presence).toBe("owned");
    expect(form.absenceReason).toBe("");
  });
});

describe("bulkLifecyclePatchFromDirty", () => {
  it("only includes dirty non-empty fields", () => {
    const patch = bulkLifecyclePatchFromDirty({
      values: {
        ...commonBulkLifecycleForm([{ presence: "owned" }]),
        presence: "away",
        absenceReason: "ordered",
        absenceSource: "Cardmarket",
        purchasePrice: "12,50",
      },
      dirtyFields: {
        presence: true,
        absenceReason: true,
        absenceSource: true,
        purchasePrice: true,
      },
      parsePriceCents,
    });
    expect(patch).toEqual({
      presence: "away",
      absenceReason: "ordered",
      absenceSource: "Cardmarket",
      purchasePriceCents: 1250,
    });
    expect(bulkLifecyclePatchIsEmpty(patch)).toBe(false);
  });

  it("ignores untouched common values", () => {
    const patch = bulkLifecyclePatchFromDirty({
      values: commonBulkLifecycleForm([
        { presence: "away", absenceReason: "ordered" },
      ]),
      dirtyFields: {},
      parsePriceCents,
    });
    expect(bulkLifecyclePatchIsEmpty(patch)).toBe(true);
  });
});
