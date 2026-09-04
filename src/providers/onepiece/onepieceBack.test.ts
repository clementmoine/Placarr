import { describe, expect, it } from "vitest";

import {
  onepieceBackCategorySlug,
  onepieceCardBackUrlForCategory,
  stampOnepieceBack,
} from "./onepieceBack";

describe("onepieceBackCategorySlug", () => {
  it("maps Leader / Event / Stage and ignores Character", () => {
    expect(onepieceBackCategorySlug("Leader")).toBe("leader");
    expect(onepieceBackCategorySlug("Event")).toBe("event");
    expect(onepieceBackCategorySlug("Stage")).toBe("stage");
    expect(onepieceBackCategorySlug("Character")).toBeNull();
    expect(onepieceBackCategorySlug(null)).toBeNull();
  });

  it("falls back to rarity Leader when category is missing", () => {
    expect(onepieceBackCategorySlug(null, "Leader")).toBe("leader");
    expect(onepieceBackCategorySlug(null, "Common")).toBeNull();
  });
});

describe("onepieceCardBackUrlForCategory", () => {
  it("points at curated sleeve files under the pack", () => {
    expect(onepieceCardBackUrlForCategory("Leader")).toBe(
      "/assets/onepiece/cards/back.leader.webp",
    );
    expect(onepieceCardBackUrlForCategory("Event")).toBe(
      "/assets/onepiece/cards/back.event.webp",
    );
    expect(onepieceCardBackUrlForCategory("Stage")).toBe(
      "/assets/onepiece/cards/back.stage.webp",
    );
    expect(onepieceCardBackUrlForCategory("Character")).toBeNull();
  });
});

describe("stampOnepieceBack", () => {
  it("stamps Leader and leaves Character on the pack default", () => {
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

    const character = stampOnepieceBack({
      printKey: "onepiece:op01-002",
      title: "Zoro",
      reference: "OP01-002",
      category: "Character",
      rarity: "Common",
    });
    expect(character.cardBackUrl).toBeUndefined();
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
