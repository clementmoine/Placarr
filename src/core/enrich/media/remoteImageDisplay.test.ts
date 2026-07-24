import { describe, expect, it } from "vitest";

import {
  isLocalUploadImageSrc,
  remoteImageDisplaySrc,
  remoteImageNeedsProxy,
  remoteImageProxyPath,
  remoteImageShouldSkipOptimizer,
} from "./remoteImageDisplay";

describe("remoteImageDisplay", () => {
  const booknodeFull =
    "https://cdn1.booknode.com/book_cover/5518/full/lart-et-la-creation-de-arcane-5517967.jpg";

  it("detects referer-protected CDN URLs", () => {
    expect(remoteImageNeedsProxy(booknodeFull)).toBe(true);
    expect(remoteImageNeedsProxy("/uploads/local.webp")).toBe(false);
    expect(remoteImageNeedsProxy("https://i.ebayimg.com/x.jpg")).toBe(false);
  });

  it("skips the Next optimizer for local uploads and proxied CDNs", () => {
    expect(isLocalUploadImageSrc("/uploads/cover.webp")).toBe(true);
    expect(remoteImageShouldSkipOptimizer("/uploads/cover.webp")).toBe(true);
    expect(remoteImageShouldSkipOptimizer(booknodeFull)).toBe(true);
    expect(
      remoteImageShouldSkipOptimizer(
        `/api/media/remote?url=${encodeURIComponent(booknodeFull)}`,
      ),
    ).toBe(true);
    expect(
      remoteImageShouldSkipOptimizer("https://i.ebayimg.com/images/x.jpg"),
    ).toBe(false);
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
