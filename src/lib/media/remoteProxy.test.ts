import { describe, expect, it } from "vitest";

import { remoteImageRequestHeaders } from "./remoteProxy";

describe("remoteImageProxy", () => {
  it("adds provider referer headers for protected CDNs", () => {
    expect(
      remoteImageRequestHeaders(
        "https://cdn1.booknode.com/book_cover/5518/cover.webp",
      ).Referer,
    ).toBe("https://booknode.com/");
    expect(
      remoteImageRequestHeaders(
        "https://img.chasse-aux-livres.fr/example.jpg",
      ).Referer,
    ).toBe("https://www.chasse-aux-livres.fr/");
  });
});
