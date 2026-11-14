import { describe, expect, it } from "vitest";

import {
  CONTAINMENT_ROLES,
  ITEM_KINDS,
  defaultItemKind,
  isContainmentRole,
  isItemKind,
  isSealedShelfItem,
  isShellShelfItem,
  sealedAcquisitionSnapshot,
} from "./itemKind";
import { isPresenceEventKind, PRESENCE_EVENT_KINDS } from "./itemAbsence";

describe("itemKind", () => {
  it("accepts the Prisma ItemKind / ContainmentRole vocabularies", () => {
    expect(ITEM_KINDS).toEqual(["object", "card", "sealed", "shell"]);
    expect(CONTAINMENT_ROLES).toEqual(["content", "shell"]);
    expect(isItemKind("sealed")).toBe(true);
    expect(isItemKind("booster")).toBe(false);
    expect(isContainmentRole("content")).toBe(true);
    expect(isContainmentRole("parent")).toBe(false);
  });

  it("defaults kind from printKey / skuKey", () => {
    expect(defaultItemKind({})).toBe("object");
    expect(defaultItemKind({ printKey: "naruto:ni-0001" })).toBe("card");
    expect(defaultItemKind({ skuKey: "lorcana::booster-1" })).toBe("sealed");
    expect(
      defaultItemKind({
        printKey: "x",
        skuKey: "pack::slug",
        kind: "shell",
      }),
    ).toBe("shell");
  });

  it("detects sealed / shell", () => {
    expect(isSealedShelfItem("sealed")).toBe(true);
    expect(isSealedShelfItem("card")).toBe(false);
    expect(isShellShelfItem("shell")).toBe(true);
  });
});

describe("presence event kinds (sealed audit)", () => {
  it("includes opened / materialized / declared / grade audit", () => {
    expect(PRESENCE_EVENT_KINDS).toEqual(
      expect.arrayContaining([
        "opened",
        "materialized",
        "declared",
        "grade_submitted",
        "grade_updated",
      ]),
    );
    expect(isPresenceEventKind("opened")).toBe(true);
    expect(isPresenceEventKind("materialized")).toBe(true);
    expect(isPresenceEventKind("declared")).toBe(true);
    expect(isPresenceEventKind("grade_submitted")).toBe(true);
    expect(isPresenceEventKind("ripped")).toBe(false);
  });
});

describe("sealedAcquisitionSnapshot", () => {
  it("freezes sku + purchase fields for the acquired event", () => {
    expect(
      sealedAcquisitionSnapshot({
        skuKey: "lorcana::booster-1",
        skuName: "Booster Chapter 1",
        skuLanguage: "FR",
        purchasePriceCents: 499,
        purchasedAt: new Date("2026-11-07T12:00:00.000Z"),
        imageUrl: "/assets/x.webp",
        catalogueKind: "booster",
      }),
    ).toEqual({
      skuKey: "lorcana::booster-1",
      skuName: "Booster Chapter 1",
      skuLanguage: "fr",
      purchasePriceCents: 499,
      purchasedAt: "2026-11-07T12:00:00.000Z",
      imageUrl: "/assets/x.webp",
      catalogueKind: "booster",
    });
  });
});
