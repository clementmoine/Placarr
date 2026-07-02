import { describe, expect, it } from "vitest";

import { coverDownloadCandidates } from "./coverDownloadCandidates";

describe("coverDownloadCandidates", () => {
  it("delegates Booknode CDN URLs to the provider module", () => {
    const url =
      "https://cdn1.booknode.com/book_cover/1691/full/super-picsou-geant-n2-1691462.jpg";

    const candidates = coverDownloadCandidates(url);
    expect(candidates[0]).toBe(url);
    expect(candidates).toContain(
      "https://cdn1.booknode.com/book_cover/1691/mod11/super-picsou-geant-n2-1691462-264-432.webp",
    );
  });

  it("returns the original URL when no provider expands it", () => {
    const url = "https://covers.openlibrary.org/b/id/12345-L.jpg";
    expect(coverDownloadCandidates(url)).toEqual([url]);
  });
});
