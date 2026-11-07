import { describe, expect, it } from "vitest";

import {
  filterItemsByShelfView,
  itemMatchesShelfView,
  parseItemCollectionShelfView,
} from "@/core/collect/shelfView";

describe("parseItemCollectionShelfView", () => {
  it("defaults to active", () => {
    expect(parseItemCollectionShelfView(null)).toBe("active");
    expect(parseItemCollectionShelfView("nope")).toBe("active");
  });

  it("accepts known views", () => {
    expect(parseItemCollectionShelfView("past")).toBe("past");
    expect(parseItemCollectionShelfView("duplicates")).toBe("duplicates");
  });
});

describe("itemMatchesShelfView", () => {
  it("active / duplicates keep owned and away", () => {
    expect(itemMatchesShelfView({ presence: "owned" }, "active")).toBe(true);
    expect(itemMatchesShelfView({ presence: "away" }, "active")).toBe(true);
    expect(itemMatchesShelfView({ presence: "past" }, "active")).toBe(false);
    expect(itemMatchesShelfView({ presence: "wanted" }, "active")).toBe(false);
    expect(itemMatchesShelfView({ presence: "owned" }, "duplicates")).toBe(
      true,
    );
  });

  it("treats missing presence as owned", () => {
    expect(itemMatchesShelfView({}, "active")).toBe(true);
    expect(itemMatchesShelfView({}, "past")).toBe(false);
  });

  it("scopes dedicated views", () => {
    expect(itemMatchesShelfView({ presence: "away" }, "away")).toBe(true);
    expect(itemMatchesShelfView({ presence: "owned" }, "away")).toBe(false);
    expect(itemMatchesShelfView({ presence: "wanted" }, "wanted")).toBe(true);
    expect(itemMatchesShelfView({ presence: "past" }, "past")).toBe(true);
    expect(itemMatchesShelfView({ presence: "past" }, "all")).toBe(true);
  });
});

describe("filterItemsByShelfView", () => {
  it("filters a mixed shelf", () => {
    const items = [
      { id: "1", presence: "owned" as const },
      { id: "2", presence: "away" as const },
      { id: "3", presence: "past" as const },
      { id: "4", presence: "wanted" as const },
    ];
    expect(filterItemsByShelfView(items, "active").map((i) => i.id)).toEqual([
      "1",
      "2",
    ]);
    expect(filterItemsByShelfView(items, "past").map((i) => i.id)).toEqual([
      "3",
    ]);
    expect(filterItemsByShelfView(items, "all")).toHaveLength(4);
  });
});
