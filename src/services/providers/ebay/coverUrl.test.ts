import { describe, expect, it } from "vitest";

import { bestEbayCoverUrl, ebayCoverDownloadCandidates } from "./coverUrl";

describe("ebayCoverDownloadCandidates", () => {
  it("prefers s-l1600 over s-l225", () => {
    const url = "https://i.ebayimg.com/images/g/UQ0AAOSwUfBglr-b/s-l225.jpg";
    expect(bestEbayCoverUrl(url)).toBe(
      "https://i.ebayimg.com/images/g/UQ0AAOSwUfBglr-b/s-l1600.jpg",
    );
    expect(ebayCoverDownloadCandidates(url)[0]).toBe(
      "https://i.ebayimg.com/images/g/UQ0AAOSwUfBglr-b/s-l1600.jpg",
    );
  });
});
