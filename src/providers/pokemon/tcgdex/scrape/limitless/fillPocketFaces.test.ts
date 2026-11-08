import { describe, expect, it } from "vitest";

import { limitlessPocketFaceUrl } from "./fillPocketFaces";

describe("limitlessPocketFaceUrl", () => {
  it("pads collector numbers for Pocket CDN paths", () => {
    expect(limitlessPocketFaceUrl("B2a", "1")).toBe(
      "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/pocket/B2a/B2a_001_EN.webp",
    );
    expect(limitlessPocketFaceUrl("b2a", "131", "EN")).toBe(
      "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/pocket/b2a/b2a_131_EN.webp",
    );
  });
});
