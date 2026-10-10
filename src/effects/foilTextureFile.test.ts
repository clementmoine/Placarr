import { describe, expect, it } from "vitest";

import { foilTextureFile } from "./foilTextureFile";

describe("foilTextureFile", () => {
  it("appends .webp to Unity stems", () => {
    expect(foilTextureFile("bw10_fr_001")).toBe("bw10_fr_001.webp");
  });

  it("rewrites legacy .png to .webp", () => {
    expect(foilTextureFile("mask.png")).toBe("mask.webp");
    expect(foilTextureFile("MASK.PNG")).toBe("MASK.webp");
  });

  it("keeps .webp as-is", () => {
    expect(foilTextureFile("art.webp")).toBe("art.webp");
  });
});
