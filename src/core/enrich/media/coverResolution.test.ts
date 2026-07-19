import { describe, expect, it } from "vitest";

import {
  coverUrlExpectsHighResolution,
  isCoverResolutionAcceptable,
} from "./coverResolution";

describe("coverUrlExpectsHighResolution", () => {
  it("detects Booknode /full/ JPEG URLs", () => {
    expect(
      coverUrlExpectsHighResolution(
        "https://cdn1.booknode.com/book_cover/5518/full/lart-et-la-creation-de-arcane-5517968.jpg",
      ),
    ).toBe(true);
  });

  it("ignores mod11 thumbnails", () => {
    expect(
      coverUrlExpectsHighResolution(
        "https://cdn1.booknode.com/book_cover/5518/mod11/lart-et-la-creation-de-arcane-5517968-264-432.webp",
      ),
    ).toBe(false);
  });
});

describe("isCoverResolutionAcceptable", () => {
  it("accepts catalog thumbs below the former 280px floor", () => {
    expect(isCoverResolutionAcceptable({ width: 180, height: 293 })).toBe(
      true,
    );
  });

  it("accepts unknown metrics", () => {
    expect(isCoverResolutionAcceptable(null)).toBe(true);
  });
});
