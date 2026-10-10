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
      remoteImageRequestHeaders("https://img.chasse-aux-livres.fr/example.jpg")
        .Referer,
    ).toBe("https://www.chasse-aux-livres.fr/");
    // Anubis: bare GETs return HTML; Flare cookies need this referer.
    expect(
      remoteImageRequestHeaders(
        "https://www.lddb.com/cover/ld/07901-08000/07986.jpg",
      ).Referer,
    ).toBe("https://www.lddb.com/");
  });
});
