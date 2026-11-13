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

  it("accepts known views and folds the old unfiltered alias", () => {
    expect(parseItemCollectionShelfView("past")).toBe("past");
    expect(parseItemCollectionShelfView("duplicates")).toBe("duplicates");
    expect(parseItemCollectionShelfView("all")).toBe("active");
    expect(parseItemCollectionShelfView("wanted")).toBe("away");
  });
});

describe("itemMatchesShelfView", () => {
  it("active keeps every presence; duplicates stay on owned and away", () => {
    expect(itemMatchesShelfView({ presence: "owned" }, "active")).toBe(true);
    expect(itemMatchesShelfView({ presence: "away" }, "active")).toBe(true);
    expect(itemMatchesShelfView({ presence: "past" }, "active")).toBe(true);
    expect(itemMatchesShelfView({ presence: "wanted" }, "active")).toBe(true);
    expect(itemMatchesShelfView({ presence: "owned" }, "duplicates")).toBe(
      true,
    );
    expect(itemMatchesShelfView({ presence: "past" }, "duplicates")).toBe(
      false,
    );
    expect(itemMatchesShelfView({ presence: "wanted" }, "duplicates")).toBe(
      true,
    );
    expect(itemMatchesShelfView({ presence: "wanted" }, "away")).toBe(true);
  });

  it("treats missing presence as owned", () => {
    expect(itemMatchesShelfView({}, "active")).toBe(true);
    expect(itemMatchesShelfView({}, "past")).toBe(false);
  });

  it("scopes dedicated views", () => {
    expect(itemMatchesShelfView({ presence: "away" }, "away")).toBe(true);
    expect(itemMatchesShelfView({ presence: "owned" }, "away")).toBe(false);
    expect(itemMatchesShelfView({ presence: "past" }, "past")).toBe(true);
    expect(
      itemMatchesShelfView(
        { presence: "past" },
        parseItemCollectionShelfView("all"),
      ),
    ).toBe(true);
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
      "3",
      "4",
    ]);
    expect(filterItemsByShelfView(items, "past").map((i) => i.id)).toEqual([
      "3",
    ]);
    expect(filterItemsByShelfView(items, "active")).toHaveLength(4);
  });
});
