import { describe, expect, it } from "vitest";

import { faviconDomainForUrl, googleFaviconUrl } from "./favicon";

describe("faviconDomainForUrl", () => {
  it("strips www before building Google favicon URLs", () => {
    expect(faviconDomainForUrl("https://www.deezer.com/album/103069")).toBe(
      "deezer.com",
    );
    expect(googleFaviconUrl("deezer.com")).toBe(
      "https://www.google.com/s2/favicons?domain=deezer.com&sz=32",
    );
  });

  it("keeps non-www hostnames unchanged", () => {
    expect(faviconDomainForUrl("https://musicbrainz.org/release/abc")).toBe(
      "musicbrainz.org",
    );
  });
});
