import { describe, expect, it } from "vitest";

import {
  dbsFwCatalogueFacePath,
  dbsFwFolderLooksParallel,
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

describe("dbsFwFolderLooksParallel", () => {
  it.each([
    ["004-p1", true],
    ["139-superpara", true],
    ["15-para-1an", true],
    ["086-para-1anv", true],
    ["020", false],
    ["001", false],
  ] as const)("%s → %s", (folder, parallel) => {
    expect(dbsFwFolderLooksParallel(folder)).toBe(parallel);
  });
});

describe("dbsFwFrostLeafForPrint", () => {
  it.each([
    ["dbsfw:st01-004-p1", "foil-holo"],
    ["dbsfw:st01-020", "card"],
    ["dbsfw:e-111-p1", "para"],
    ["dbsfw:e-106-p1", "e106-para"],
    ["dbsfw:fb01-139-superpara", "superpara"],
    ["dbsfw:fb99-001-superpara", "superpara"],
    // Ordinary parallel — FoilType 0 (not foil-holo / orange flood)
    ["dbsfw:fb01-001-p1", "para"],
    ["dbsfw:st01-001-p1", "para"],
    // Tabac / pakipaki folder tokens
    ["dbsfw:fs02-15-para-1an", "tabac-holo"],
    ["dbsfw:fb02-086-para-1anv", "pakipaki"],
    // Base foil without parallel folder
    ["dbsfw:fb01-001", "foil-holo"],
    [null, "foil-holo"],
  ] as const)("%s → %s", (key, leaf) => {
    expect(dbsFwFrostLeafForPrint(key)).toBe(leaf);
  });
});
