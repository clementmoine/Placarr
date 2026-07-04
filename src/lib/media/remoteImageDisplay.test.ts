import { describe, expect, it } from "vitest";

import {
  remoteImageDisplaySrc,
  remoteImageNeedsProxy,
  remoteImageProxyPath,
} from "./remoteImageDisplay";

describe("remoteImageDisplay", () => {
  const booknodeFull =
    "https://cdn1.booknode.com/book_cover/5518/full/lart-et-la-creation-de-arcane-5517967.jpg";

  it("detects referer-protected CDN URLs", () => {
    expect(remoteImageNeedsProxy(booknodeFull)).toBe(true);
    expect(remoteImageNeedsProxy("/uploads/local.webp")).toBe(false);
    expect(remoteImageNeedsProxy("https://i.ebayimg.com/x.jpg")).toBe(false);
  });

  it("builds an internal proxy path for allowed targets", () => {
    expect(remoteImageProxyPath(booknodeFull)).toBe(
      `/api/media/remote?url=${encodeURIComponent(booknodeFull)}`,
    );
    expect(remoteImageDisplaySrc(booknodeFull)).toBe(
      `/api/media/remote?url=${encodeURIComponent(booknodeFull)}`,
    );
  });

  it("rejects non-HTTPS targets", () => {
    expect(
      remoteImageProxyPath("http://cdn1.booknode.com/book_cover/x.jpg"),
    ).toBeNull();
  });
});
