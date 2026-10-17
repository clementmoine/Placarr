import { describe, expect, it } from "vitest";

import {
  onepieceBackCategorySlug,
  onepieceCardBackUrlForCategory,
  stampOnepieceBack,
} from "./onepieceBack";

describe("onepieceBackCategorySlug", () => {
  it("stamps only Leader / DON!! — Event / Stage share the pack default", () => {
    expect(onepieceBackCategorySlug("Leader")).toBe("leader");
    expect(onepieceBackCategorySlug("DON!!")).toBe("don");
    expect(onepieceBackCategorySlug("DON")).toBe("don");
    expect(onepieceBackCategorySlug("Event")).toBeNull();
    expect(onepieceBackCategorySlug("Stage")).toBeNull();
    expect(onepieceBackCategorySlug("Character")).toBeNull();
    expect(onepieceBackCategorySlug(null)).toBeNull();
  });

  it("falls back to rarity Leader when category is missing", () => {
    expect(onepieceBackCategorySlug(null, "Leader")).toBe("leader");
    expect(onepieceBackCategorySlug(null, "Common")).toBeNull();
  });
});

describe("onepieceCardBackUrlForCategory", () => {
  it("points at distinct curated sleeves only", () => {
    expect(onepieceCardBackUrlForCategory("Leader")).toBe(
      "/assets/onepiece/cards/back.leader.webp",
    );
    expect(onepieceCardBackUrlForCategory("DON!!")).toBe(
      "/assets/onepiece/cards/back.don.webp",
    );
    expect(onepieceCardBackUrlForCategory("Event")).toBeNull();
    expect(onepieceCardBackUrlForCategory("Stage")).toBeNull();
    expect(onepieceCardBackUrlForCategory("Character")).toBeNull();
  });
});

describe("stampOnepieceBack", () => {
  it("stamps Leader / DON and leaves Character on the pack default", () => {
    const leader = stampOnepieceBack({
      printKey: "onepiece:op01-001",
      title: "Luffy",
      reference: "OP01-001",
      category: "Leader",
      rarity: "Leader",
    });
    expect(leader.cardBackUrl).toBe(
      "/assets/onepiece/cards/back.leader.webp",
    );

    const don = stampOnepieceBack({
      printKey: "onepiece:don-001",
      title: "DON!!",
      reference: "DON!!",
      category: "DON!!",
    });
    expect(don.cardBackUrl).toBe("/assets/onepiece/cards/back.don.webp");

    const character = stampOnepieceBack({
      printKey: "onepiece:op01-002",
      title: "Zoro",
      reference: "OP01-002",
      category: "Character",
      rarity: "Common",
    });
    expect(character.cardBackUrl).toBeUndefined();

    const event = stampOnepieceBack({
      printKey: "onepiece:op01-009",
      title: "Event",
      reference: "OP01-009",
      category: "Event",
    });
    expect(event.cardBackUrl).toBeUndefined();
  });

  it("does not overwrite an existing print-scoped back", () => {
    const kept = stampOnepieceBack({
      printKey: "onepiece:op01-001",
      title: "Luffy",
      reference: "OP01-001",
      category: "Leader",
      cardBackUrl: "/uploads/custom-back.webp",
    });
    expect(kept.cardBackUrl).toBe("/uploads/custom-back.webp");
  });
});
