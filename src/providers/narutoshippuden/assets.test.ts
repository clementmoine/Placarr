import { describe, expect, it } from "vitest";

import {
  narutoShippudenAssetsCardUrl,
  normalizeShippudenDiskId,
} from "./assets";

describe("normalizeShippudenDiskId", () => {
  it.each([
    ["gaku", "gaku0038", "gaku0038"],
    ["gaku", "0038", "gaku0038"],
    ["gaku", "38", "gaku0038"],
    ["shi", "shi0043", "shi0043"],
    ["shi", "43", "shi0043"],
    ["mju", "0165", "mju0165"],
  ])("%s + %s → %s", (family, number, want) => {
    expect(normalizeShippudenDiskId(family, number)).toBe(want);
  });
});

describe("narutoShippudenAssetsCardUrl", () => {
  it("joins set/lang/diskId — matching packCardDir on disk", () => {
    expect(
      narutoShippudenAssetsCardUrl("gaku", "0038", "ja", "art.suruga.jpg"),
    ).toBe(
      "/assets/naruto/shippuden/cards/gaku/ja/gaku0038/art.suruga.jpg",
    );
    expect(
      narutoShippudenAssetsCardUrl("gaku", "gaku0038", "ja", "art.suruga.jpg"),
    ).toBe(
      "/assets/naruto/shippuden/cards/gaku/ja/gaku0038/art.suruga.jpg",
    );
  });
});
