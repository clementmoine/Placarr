import { describe, expect, it } from "vitest";

import {
  dbsFwCatalogueFacePath,
  dbsFwFrostLeafForPrint,
} from "./frostLeaf";

describe("dbsFwCatalogueFacePath", () => {
  it.each([
    ["dbsfw:st01-004-p1", "st01/004-p1"],
    ["dbsfw:fb01-139-superpara", "fb01/139-superpara"],
    ["dbsfw:e-111-p1", "e/111-p1"],
    ["dbsfw:st01-020", "st01/020"],
    ["lorcana:1-1", null],
    [null, null],
  ] as const)("%s → %s", (key, path) => {
    expect(dbsFwCatalogueFacePath(key)).toBe(path);
  });
});

describe("dbsFwFrostLeafForPrint", () => {
  it.each([
    ["dbsfw:st01-004-p1", "foil-holo"],
    ["dbsfw:st01-020", "card"],
    ["dbsfw:e-111-p1", "para"],
    ["dbsfw:e-106-p1", "e106-para"],
    ["dbsfw:fb01-139-superpara", "superpara"],
    // Non-seed superpara folder token
    ["dbsfw:fb99-001-superpara", "superpara"],
    // Ordinary parallel without a playroom seed
    ["dbsfw:fb01-001-p1", "foil-holo"],
    [null, "foil-holo"],
  ] as const)("%s → %s", (key, leaf) => {
    expect(dbsFwFrostLeafForPrint(key)).toBe(leaf);
  });
});
