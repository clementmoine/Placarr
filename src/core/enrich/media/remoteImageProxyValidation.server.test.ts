import { describe, expect, it } from "vitest";

import { isAllowedRemoteImageProxyTarget } from "./remoteImageProxyValidation.server";

describe("isAllowedRemoteImageProxyTarget", () => {
  it("allows LDDb cover URLs (Anubis-protected, fragment + registry)", () => {
    expect(
      isAllowedRemoteImageProxyTarget(
        "https://www.lddb.com/cover/ld/33801-33900/33828.jpg",
      ),
    ).toBe(true);
  });

  it("allows Booknode full covers", () => {
    expect(
      isAllowedRemoteImageProxyTarget(
        "https://cdn1.booknode.com/book_cover/5518/full/example.jpg",
      ),
    ).toBe(true);
  });

  it("rejects unrelated hosts", () => {
    expect(
      isAllowedRemoteImageProxyTarget("https://evil.example/x.jpg"),
    ).toBe(false);
  });

  it("rejects non-HTTPS", () => {
    expect(
      isAllowedRemoteImageProxyTarget(
        "http://www.lddb.com/cover/ld/33801-33900/33828.jpg",
      ),
    ).toBe(false);
  });
});
