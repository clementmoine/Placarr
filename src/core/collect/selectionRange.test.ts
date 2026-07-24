import { describe, expect, it } from "vitest";

import { itemIdsInVisibleRange } from "./selectionRange";

describe("itemIdsInVisibleRange", () => {
  const ids = ["a", "b", "c", "d", "e"];

  it("selects the inclusive range between two anchors", () => {
    expect(itemIdsInVisibleRange(ids, "b", "d")).toEqual(["b", "c", "d"]);
    expect(itemIdsInVisibleRange(ids, "d", "b")).toEqual(["b", "c", "d"]);
  });

  it("returns a single id when both ends match", () => {
    expect(itemIdsInVisibleRange(ids, "c", "c")).toEqual(["c"]);
  });

  it("falls back to the clicked id when the anchor is missing", () => {
    expect(itemIdsInVisibleRange(ids, "missing", "c")).toEqual(["c"]);
  });

  it("returns empty when the clicked id is not in the list", () => {
    expect(itemIdsInVisibleRange(ids, "a", "missing")).toEqual([]);
  });
});
